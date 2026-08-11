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
import { config as loadEnvFile } from 'dotenv';
import { Redis } from 'ioredis';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';

/**
 * Carga del `.env` del monorepo.
 *
 * Sin esto el worker **no arrancaba en local**: `loadEnv()` lee `process.env` y
 * nadie ponía nada ahí. En producción el entorno lo da el contenedor (DEC-001),
 * así que el hueco solo se notaba al intentar correrlo a mano — y hasta hoy
 * nadie lo había intentado.
 *
 * Se busca hacia arriba en vez de fijar `../../../.env`: la ruta relativa
 * depende de si se ejecuta el fuente o el compilado, y una constante acertaría
 * en un caso y fallaría en el otro sin decir por qué. Las variables que ya
 * estén definidas mandan, que es como se sobrescribe en un despliegue.
 */
function cargarEntornoDelMonorepo(): void {
  let directorio = dirname(fileURLToPath(import.meta.url));

  for (let salto = 0; salto < 6; salto += 1) {
    const candidato = join(directorio, '.env');

    if (existsSync(candidato)) {
      loadEnvFile({ path: candidato, quiet: true });
      return;
    }

    const padre = dirname(directorio);
    if (padre === directorio) break;
    directorio = padre;
  }
}

cargarEntornoDelMonorepo();

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

/**
 * Dos colas, no una — y esta es la razón.
 *
 * Con una sola cola y `concurrency: 1`, los dos trabajos compartían la única
 * ranura de ejecución. Un SMTP que no responde —no rechaza: se queda callado,
 * que es el fallo típico de un bloqueo por reputación o un cortafuegos— consume
 * su tiempo de espera completo por cada uno de los cincuenta envíos del lote.
 * Mientras tanto **la expiración de `HELD` no corría**, y DEC-005 promete
 * treinta minutos: las camas retenidas se quedaban ocupadas por un problema de
 * correo.
 *
 * Cada cola tiene su Worker y su conexión. Un Worker bloquea su conexión
 * esperando trabajo, así que compartirla los volvería a acoplar.
 */
const QUEUE_HELD = 'encuentro-retenciones';
const QUEUE_MAIL = 'encuentro-correo';

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
 * poder emitir mientras tanto. Y cada Worker necesita la suya por lo mismo: dos
 * Workers sobre una conexión volverían a serializarse.
 */
const queueConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const heldConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const mailConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const connections = [
  ['queue', queueConnection],
  ['worker-retenciones', heldConnection],
  ['worker-correo', mailConnection],
] as const;

for (const [name, connection] of connections) {
  connection.on('error', (error: Error) => {
    logger.error({ err: error, connection: name }, 'fallo de conexión con Redis');
  });
}

const heldQueue = new Queue(QUEUE_HELD, { connection: queueConnection });
const mailQueue = new Queue(QUEUE_MAIL, { connection: queueConnection });

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

/**
 * Última vez que cada trabajo **terminó** correctamente.
 *
 * Alimenta el healthcheck. Se marca al terminar y no al empezar: lo que interesa
 * saber no es que el worker intentara algo, sino que lo completara.
 */
const lastSuccess: Record<string, number> = {
  [JOB_EXPIRE_HELD]: Date.now(),
  [JOB_SEND_MAIL]: Date.now(),
};

function createJobWorker(
  queueName: string,
  jobName: string,
  handler: () => Promise<void>,
  connection: Redis,
): Worker {
  const worker = new Worker(
    queueName,
    async (job) => {
      if (job.name !== jobName) {
        // Trabajo de una versión anterior que ya no existe. Fallar sería
        // reintentarlo para siempre; se registra y se descarta.
        logger.warn({ jobName: job.name, queueName }, 'trabajo desconocido; se descarta');
        return;
      }

      await handler();
      lastSuccess[jobName] = Date.now();
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, error) => {
    logger.error({ err: error, jobName: job?.name, queueName }, 'trabajo fallido');
  });

  return worker;
}

const heldWorker = createJobWorker(QUEUE_HELD, JOB_EXPIRE_HELD, runExpireHeld, heldConnection);
const mailWorker = createJobWorker(QUEUE_MAIL, JOB_SEND_MAIL, runSendMail, mailConnection);

/*
 * `upsertJobScheduler` en vez de `add`: es idempotente entre despliegues.
 * Verificado contra la documentación de BullMQ 6.0.7 — es el reemplazo de los
 * antiguos «repeatable jobs», y usar `add` crearía un programador nuevo en cada
 * arranque hasta multiplicar la carga por el número de despliegues.
 */
async function scheduleJobs(): Promise<void> {
  await heldQueue.upsertJobScheduler(
    JOB_EXPIRE_HELD,
    { every: EXPIRE_HELD_INTERVAL_MS },
    { name: JOB_EXPIRE_HELD, opts: { removeOnComplete: 100, removeOnFail: 500 } },
  );

  await mailQueue.upsertJobScheduler(
    JOB_SEND_MAIL,
    { every: SEND_MAIL_INTERVAL_MS },
    { name: JOB_SEND_MAIL, opts: { removeOnComplete: 100, removeOnFail: 500 } },
  );
}

/**
 * Señal de vida — NFR-001.
 *
 * Un worker **vivo pero inerte** no se distinguía de uno sano. Si Redis se queda
 * sin memoria un viernes por la noche, el contenedor sigue en `running` y
 * `docker ps` lo da por bueno; durante el fin de semana no expira ninguna
 * retención ni sale ningún correo, y nadie se entera hasta el lunes.
 *
 * Responde 503 si algún trabajo lleva más de tres cadencias sin completarse. Tres
 * y no una: una ejecución lenta o un reinicio no deben marcar el proceso como
 * enfermo, pero tres seguidas ya no son ruido.
 *
 * Es el mínimo que hace accionable un `HEALTHCHECK` de contenedor. No sustituye
 * a la supervisión externa, que sigue pendiente con el VPS.
 */
const HEALTH_TOLERANCE = 3;

const healthDeadlines: Readonly<Record<string, number>> = {
  [JOB_EXPIRE_HELD]: EXPIRE_HELD_INTERVAL_MS * HEALTH_TOLERANCE,
  [JOB_SEND_MAIL]: SEND_MAIL_INTERVAL_MS * HEALTH_TOLERANCE,
};

function healthReport(): { healthy: boolean; jobs: Record<string, number> } {
  const now = Date.now();
  const jobs: Record<string, number> = {};
  let healthy = true;

  for (const [jobName, deadline] of Object.entries(healthDeadlines)) {
    const age = now - (lastSuccess[jobName] ?? 0);
    jobs[jobName] = Math.round(age / 1000);
    if (age > deadline) healthy = false;
  }

  return { healthy, jobs };
}

const health = createServer((request, response) => {
  if (request.url !== '/health') {
    response.writeHead(404).end();
    return;
  }

  const report = healthReport();

  response
    .writeHead(report.healthy ? 200 : 503, { 'content-type': 'application/json' })
    // Solo antigüedades en segundos: ni PII ni detalle de la cola.
    .end(JSON.stringify({ status: report.healthy ? 'ok' : 'stale', secondsSince: report.jobs }));
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'apagando worker');

  health.close();

  /*
   * `close()` espera a que termine el trabajo en curso, que sigue siendo lo
   * correcto. Antes era además la única defensa: una muerte a mitad dejaba
   * notificaciones en `SENDING` que ninguna consulta volvía a tomar. Ya no —
   * `claimDue` recupera las reclamaciones abandonadas—, pero apagar limpio
   * evita que esa recuperación haga falta y con ella el riesgo de duplicado.
   */
  await Promise.all([heldWorker.close(), mailWorker.close()]);
  await Promise.all([heldQueue.close(), mailQueue.close()]);
  await Promise.all([queueConnection.quit(), heldConnection.quit(), mailConnection.quit()]);
  await prisma.$disconnect();

  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await scheduleJobs();

health.listen(env.WORKER_HEALTH_PORT);

logger.info(
  {
    startedAt: systemClock.now().toISOString(),
    queues: [QUEUE_HELD, QUEUE_MAIL],
    healthPort: env.WORKER_HEALTH_PORT,
  },
  'worker ENCUENTRO iniciado',
);
