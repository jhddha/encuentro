import { dispatchNotifications, expireHeldReservations } from '@encuentro/application';
import { loadEnv } from '@encuentro/config';
import {
  createEmailSender,
  createNotificationRepository,
  createPrismaClient,
  createReservationRepository,
  findSmtpSettings,
  systemClock,
} from '@encuentro/infrastructure';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';

/**
 * Proceso worker — DEC-001.
 *
 * Corre separado de `apps/web` (DEC-001) y sostiene los dos procesos de fondo
 * que el sistema da por existentes:
 *
 *  - **Expiración de `HELD`** (DEC-005). Sin esto, una retención abandonada
 *    ocupa una cama para siempre y la cama nunca vuelve al inventario.
 *  - **Envío de correo** (GOV-008, ADR-007). Fuera de la petición, para que un
 *    SMTP caído no revierta un pago ya aprobado.
 *
 * Ambos son idempotentes y acotados por lote: si el worker estuvo caído, la
 * siguiente ejecución recupera el atraso en tandas, no en una transacción
 * gigante.
 */

const env = loadEnv();

const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  // GOV/seguridad: los logs no deben exponer PII ni secretos (regla 03-security-rbac).
  redact: {
    paths: [
      'password',
      'token',
      'secret',
      '*.password',
      '*.token',
      '*.secret',
      'toEmail',
      '*.toEmail',
    ],
    censor: '[redacted]',
  },
});

/**
 * Actor al que se atribuyen las escrituras automáticas.
 *
 * Creado por la migración `20260805143000_p16_background_workers`. El
 * identificador es fijo a propósito: buscarlo por correo obligaría a una
 * consulta en cada arranque y dejaría el worker a merced de que alguien
 * renombre la cuenta.
 */
const SYSTEM_ACTOR_ID = '00000000-0000-4000-8000-000000000001';

const QUEUE_NAME = 'encuentro-mantenimiento';

const JOB_EXPIRE_HELD = 'expirar-retenciones';
const JOB_SEND_MAIL = 'enviar-notificaciones';

/**
 * Cadencias.
 *
 * Un minuto para las retenciones: DEC-005 fija 30 minutos, así que un minuto de
 * imprecisión es un 3% del plazo y nadie lo nota. Bajarlo a segundos solo
 * añadiría consultas sin liberar una cama antes de forma apreciable.
 *
 * Treinta segundos para el correo: es el intervalo entre que se aprueba un pago
 * y el peregrino recibe su comprobante, y ahí la espera sí se percibe.
 */
const EXPIRE_HELD_INTERVAL_MS = 60_000;
const SEND_MAIL_INTERVAL_MS = 30_000;

const prisma = createPrismaClient(env.DATABASE_URL);

/*
 * Queue y Worker reciben conexiones distintas. El Worker bloquea su conexión
 * esperando trabajo (BRPOPLPUSH), así que compartirla dejaría a la Queue sin
 * poder emitir mientras tanto.
 */
const queueConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const workerConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

for (const [name, connection] of [
  ['queue', queueConnection],
  ['worker', workerConnection],
] as const) {
  connection.on('error', (error: Error) => {
    logger.error({ err: error, connection: name }, 'fallo de conexión con Redis');
  });
}

const queue = new Queue(QUEUE_NAME, { connection: queueConnection });

const reservations = createReservationRepository(prisma);
const notifications = createNotificationRepository(prisma);

/** Expiración de retenciones — DEC-005. */
async function runExpireHeld(): Promise<void> {
  const result = await expireHeldReservations({
    reservations,
    clock: systemClock,
    systemActorId: SYSTEM_ACTOR_ID,
  });

  if (result.examined === 0) return;

  logger.info(result, 'retenciones procesadas');

  /*
   * Una discrepancia significa que `held_until` no concuerda con la regla de
   * DEC-005. El worker no la corrige —no le corresponde— pero tampoco la
   * silencia: es señal de que algo escribió mal la columna.
   */
  if (result.disagreed > 0) {
    logger.warn(
      { disagreed: result.disagreed },
      'candidatas ignoradas: held_until no concuerda con DEC-005',
    );
  }
}

/** Envío de notificaciones — GOV-007, GOV-008. */
async function runSendMail(): Promise<void> {
  const settings = await findSmtpSettings(prisma);

  if (settings === null) {
    // Sistema recién instalado, sin correo configurado. No es un fallo: los
    // envíos se acumulan en `PENDING` y saldrán cuando alguien configure SMTP.
    logger.debug('SMTP sin configurar; no se intenta enviar');
    return;
  }

  const email = createEmailSender(settings, { password: env.SMTP_PASSWORD });

  const result = await dispatchNotifications({ notifications, email, clock: systemClock });

  if (result.claimed === 0) return;

  logger.info(result, 'notificaciones procesadas');

  // GOV-008: un fallo definitivo no debe quedar solo en la tabla. Alguien tiene
  // que enterarse de que un correo no salió y no volverá a intentarse.
  if (result.abandoned > 0) {
    logger.error({ abandoned: result.abandoned }, 'envíos abandonados sin reintento');
  }
}

const handlers: Readonly<Record<string, () => Promise<void>>> = {
  [JOB_EXPIRE_HELD]: runExpireHeld,
  [JOB_SEND_MAIL]: runSendMail,
};

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const handler = handlers[job.name];

    if (handler === undefined) {
      // Trabajo de una versión anterior que ya no existe. Fallar sería
      // reintentarlo para siempre; se registra y se descarta.
      logger.warn({ jobName: job.name }, 'trabajo desconocido; se descarta');
      return;
    }

    await handler();
  },
  { connection: workerConnection, concurrency: 1 },
);

worker.on('failed', (job, error) => {
  logger.error({ err: error, jobName: job?.name }, 'trabajo fallido');
});

/*
 * `upsertJobScheduler` en vez de `add`: es idempotente entre despliegues.
 * Verificado contra la documentación de BullMQ 6.0.7 — es el reemplazo de los
 * antiguos «repeatable jobs», y usar `add` crearía un programador nuevo en cada
 * arranque hasta multiplicar la carga por el número de despliegues.
 */
async function scheduleJobs(): Promise<void> {
  await queue.upsertJobScheduler(
    JOB_EXPIRE_HELD,
    { every: EXPIRE_HELD_INTERVAL_MS },
    { name: JOB_EXPIRE_HELD, opts: { removeOnComplete: 100, removeOnFail: 500 } },
  );

  await queue.upsertJobScheduler(
    JOB_SEND_MAIL,
    { every: SEND_MAIL_INTERVAL_MS },
    { name: JOB_SEND_MAIL, opts: { removeOnComplete: 100, removeOnFail: 500 } },
  );
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'apagando worker');

  // `worker.close()` espera a que termine el trabajo en curso. Matarlo a mitad
  // dejaría notificaciones en `SENDING`, que ninguna consulta vuelve a tomar.
  await worker.close();
  await queue.close();
  await queueConnection.quit();
  await workerConnection.quit();
  await prisma.$disconnect();

  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await scheduleJobs();

logger.info(
  {
    startedAt: systemClock.now().toISOString(),
    jobs: [JOB_EXPIRE_HELD, JOB_SEND_MAIL],
  },
  'worker ENCUENTRO iniciado',
);
