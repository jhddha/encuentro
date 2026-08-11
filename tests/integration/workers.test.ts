import { dispatchNotifications, expireHeldReservations, type Clock } from '@encuentro/application';
import { HELD_DURATION_MS, MAX_DELIVERY_ATTEMPTS, STALE_SENDING_MS } from '@encuentro/domain';
import {
  createNotificationRepository,
  createReservationRepository,
  type PrismaClient,
} from '@encuentro/infrastructure';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, seedEvent, testPrisma } from './helpers';

/**
 * Gate de P16: los dos procesos de fondo, contra la base real.
 *
 * Las pruebas unitarias verifican las reglas con repositorios falsos. Aquí se
 * comprueba lo que solo la base puede demostrar: que el compare-and-swap
 * resuelve la carrera, que la cama vuelve al inventario, que el CHECK de
 * `held_until` no bloquea la expiración y que dos workers no reclaman el mismo
 * correo.
 */
const prisma: PrismaClient = testPrisma();

const SYSTEM_ACTOR_ID = '00000000-0000-4000-8000-000000000001';

const CHECK_IN = new Date('2026-11-01T00:00:00Z');
const CHECK_OUT = new Date('2026-11-08T00:00:00Z');
const NIGHTS = 7;

const NOW = new Date('2026-08-05T12:00:00.000Z');
const clock: Clock = { now: () => NOW };

const reservations = createReservationRepository(prisma);
const notifications = createNotificationRepository(prisma);

/**
 * Recrea el actor de sistema.
 *
 * Lo crea la migración `p16_background_workers`, pero `resetDatabase` hace
 * TRUNCATE de `users` y se lo lleva por delante. En producción nadie trunca esa
 * tabla; aquí hay que reponerlo en cada prueba.
 */
async function seedSystemActor(): Promise<void> {
  await prisma.user.create({
    data: {
      id: SYSTEM_ACTOR_ID,
      email: 'sistema@encuentro.invalid',
      displayName: 'Sistema',
      status: 'SYSTEM',
    },
  });
}

async function seedRegistration(eventId: string, name: string): Promise<string> {
  const person = await prisma.person.create({
    data: { fullName: name, birthDate: new Date('1990-01-01') },
  });

  const pkg = await prisma.package.upsert({
    where: { eventId_code: { eventId, code: 'GENERAL' } },
    update: {},
    create: { eventId, code: 'GENERAL', name: 'General', visibility: 'PUBLIC' },
  });

  let version = await prisma.priceVersion.findFirst({ where: { packageId: pkg.id } });
  version ??= await prisma.priceVersion.create({
    data: { packageId: pkg.id, paymentMode: 'ARRIVAL', amount: '420.00', currency: 'USD' },
  });

  const registration = await prisma.registration.create({
    data: {
      eventId,
      code: `REG-${Math.random().toString(36).slice(2, 10)}`,
      personId: person.id,
      packageId: pkg.id,
      priceVersionId: version.id,
      paymentMode: 'ARRIVAL',
      status: 'CONFIRMED',
    },
  });

  return registration.id;
}

interface Lodging {
  readonly eventId: string;
  readonly hotelId: string;
  readonly roomId: string;
}

async function seedLodging(): Promise<Lodging> {
  const event = await seedEvent(prisma, { code: 'ENC26-W', year: 2026, status: 'ACTIVE' });
  const hotel = await prisma.hotel.create({
    data: { eventId: event.id, code: 'HOTEL-1', name: 'Hotel Central' },
  });
  const room = await prisma.room.create({ data: { hotelId: hotel.id, code: '101', capacity: 1 } });

  return { eventId: event.id, hotelId: hotel.id, roomId: room.id };
}

/** Crea una retención con la antigüedad indicada respecto a `NOW`. */
async function seedHeldReservation(lodging: Lodging, ageMs: number, name: string): Promise<string> {
  const registrationId = await seedRegistration(lodging.eventId, name);
  const createdAt = new Date(NOW.getTime() - ageMs);

  const reservation = await prisma.reservation.create({
    data: {
      eventId: lodging.eventId,
      registrationId,
      hotelId: lodging.hotelId,
      roomId: lodging.roomId,
      bedIndex: 1,
      checkInDate: CHECK_IN,
      checkOutDate: CHECK_OUT,
      nightCount: NIGHTS,
      status: 'HELD',
      heldUntil: new Date(createdAt.getTime() + HELD_DURATION_MS),
      createdAt,
    },
  });

  return reservation.id;
}

beforeEach(async () => {
  await resetDatabase(prisma);
  await seedSystemActor();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('expiración de retenciones contra la base', () => {
  it('expira una retención vencida y deja held_until en NULL', async () => {
    const lodging = await seedLodging();
    const id = await seedHeldReservation(lodging, HELD_DURATION_MS + 60_000, 'Ana');

    const result = await expireHeldReservations({
      reservations,
      clock,
      systemActorId: SYSTEM_ACTOR_ID,
    });

    expect(result.expired).toBe(1);

    const row = await prisma.reservation.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('EXPIRED');
    // El CHECK `reservations_held_until_only_when_held` exige NULL fuera de HELD:
    // si la expiración no lo limpiara, la transacción entera habría fallado.
    expect(row.heldUntil).toBeNull();
    expect(row.version).toBe(2);
  });

  /*
   * HOS-002. La prueba que importa: expirar debe devolver la cama al
   * inventario. El índice único parcial solo cuenta HELD y CONFIRMED, así que
   * una reserva EXPIRED deja la plaza libre.
   */
  it('devuelve la cama al inventario', async () => {
    const lodging = await seedLodging();
    await seedHeldReservation(lodging, HELD_DURATION_MS + 60_000, 'Ana');

    await expireHeldReservations({ reservations, clock, systemActorId: SYSTEM_ACTOR_ID });

    const registrationId = await seedRegistration(lodging.eventId, 'Beto');
    const segunda = await prisma.reservation.create({
      data: {
        eventId: lodging.eventId,
        registrationId,
        hotelId: lodging.hotelId,
        roomId: lodging.roomId,
        bedIndex: 1,
        checkInDate: CHECK_IN,
        checkOutDate: CHECK_OUT,
        nightCount: NIGHTS,
        status: 'HELD',
        heldUntil: new Date(NOW.getTime() + HELD_DURATION_MS),
      },
    });

    expect(segunda.bedIndex).toBe(1);
  });

  /* HOS-012: una reserva confirmada no se libera nunca por este camino. */
  it('no toca una reserva CONFIRMED por antigua que sea', async () => {
    const lodging = await seedLodging();
    const registrationId = await seedRegistration(lodging.eventId, 'Ana');

    const confirmada = await prisma.reservation.create({
      data: {
        eventId: lodging.eventId,
        registrationId,
        hotelId: lodging.hotelId,
        roomId: lodging.roomId,
        bedIndex: 1,
        checkInDate: CHECK_IN,
        checkOutDate: CHECK_OUT,
        nightCount: NIGHTS,
        status: 'CONFIRMED',
        createdAt: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000),
      },
    });

    const result = await expireHeldReservations({
      reservations,
      clock,
      systemActorId: SYSTEM_ACTOR_ID,
    });

    expect(result.examined).toBe(0);

    const row = await prisma.reservation.findUniqueOrThrow({ where: { id: confirmada.id } });
    expect(row.status).toBe('CONFIRMED');
  });

  it('no expira una retención que aún no ha vencido', async () => {
    const lodging = await seedLodging();
    const id = await seedHeldReservation(lodging, HELD_DURATION_MS - 60_000, 'Ana');

    const result = await expireHeldReservations({
      reservations,
      clock,
      systemActorId: SYSTEM_ACTOR_ID,
    });

    expect(result.examined).toBe(0);

    const row = await prisma.reservation.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('HELD');
  });

  it('atribuye la expiración al actor de sistema en auditoría', async () => {
    const lodging = await seedLodging();
    const id = await seedHeldReservation(lodging, HELD_DURATION_MS + 60_000, 'Ana');

    await expireHeldReservations({ reservations, clock, systemActorId: SYSTEM_ACTOR_ID });

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { entity: 'reservation', entityId: id },
    });

    expect(entry.actorId).toBe(SYSTEM_ACTOR_ID);
    expect(entry.action).toBe('lodging.reservation.expire');
    expect(entry.reason).toContain('DEC-005');
    expect(entry.beforeRedacted).toMatchObject({ status: 'HELD' });
    expect(entry.afterRedacted).toMatchObject({ status: 'EXPIRED' });
  });

  /*
   * La carrera real: alguien confirma el pago justo cuando el worker leyó la
   * candidata. El compare-and-swap debe dejar ganar a la confirmación.
   */
  it('pierde la carrera contra una confirmación simultánea', async () => {
    const lodging = await seedLodging();
    const id = await seedHeldReservation(lodging, HELD_DURATION_MS + 60_000, 'Ana');

    const candidates = await reservations.findExpiryCandidates(NOW, 10);
    expect(candidates).toHaveLength(1);

    // Entre la lectura y la escritura, la reserva se confirma.
    await prisma.reservation.update({
      where: { id },
      data: { status: 'CONFIRMED', heldUntil: null, version: { increment: 1 } },
    });

    const ok = await reservations.expire({
      reservationId: id,
      expectedVersion: candidates[0]?.version ?? 0,
      actorId: SYSTEM_ACTOR_ID,
      reason: 'Retención vencida (DEC-005).',
    });

    expect(ok).toBe(false);

    const row = await prisma.reservation.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('CONFIRMED');
  });
});

describe('cola de notificaciones contra la base', () => {
  async function seedNotification(overrides: {
    readonly status?: string;
    readonly scheduledAt?: Date;
    readonly variables?: Record<string, string>;
  }): Promise<string> {
    const template = await prisma.notificationTemplate.upsert({
      where: { code_version: { code: 'PAGO_APROBADO', version: 1 } },
      update: {},
      create: {
        code: 'PAGO_APROBADO',
        subject: 'Pago aprobado — {{receiptNumber}}',
        body: 'Hola {{name}}, su pago fue aprobado.',
      },
    });

    const row = await prisma.notification.create({
      data: {
        templateId: template.id,
        toEmail: 'peregrino@example.org',
        variables: overrides.variables ?? { receiptNumber: 'REC-ENC26-000012', name: 'Ana' },
        status: overrides.status ?? 'PENDING',
        scheduledAt: overrides.scheduledAt ?? new Date(NOW.getTime() - 1000),
      },
    });

    return row.id;
  }

  it('reclama un envío vencido y lo marca SENDING de una vez', async () => {
    const id = await seedNotification({});

    const claimed = await notifications.claimDue(NOW, 10);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.subjectTemplate).toBe('Pago aprobado — {{receiptNumber}}');

    const row = await prisma.notification.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('SENDING');
  });

  /*
   * Lo que impide el correo duplicado: una segunda reclamación no vuelve a ver
   * la fila, porque ya no está en PENDING.
   */
  it('una segunda reclamación no devuelve el mismo envío', async () => {
    await seedNotification({});

    const primera = await notifications.claimDue(NOW, 10);
    const segunda = await notifications.claimDue(NOW, 10);

    expect(primera).toHaveLength(1);
    expect(segunda).toHaveLength(0);
  });

  it('no reclama un envío programado para el futuro', async () => {
    await seedNotification({ scheduledAt: new Date(NOW.getTime() + 60_000) });

    const claimed = await notifications.claimDue(NOW, 10);

    expect(claimed).toHaveLength(0);
  });

  it('un reintento vuelve a PENDING con la fecha futura', async () => {
    const id = await seedNotification({});
    await notifications.claimDue(NOW, 10);

    const retryAt = new Date(NOW.getTime() + 60_000);
    await notifications.markFailed(id, 'conexión rechazada', retryAt);

    const row = await prisma.notification.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.scheduledAt).toEqual(retryAt);

    // Y no se vuelve a tomar hasta que llegue esa fecha.
    expect(await notifications.claimDue(NOW, 10)).toHaveLength(0);
    expect(await notifications.claimDue(retryAt, 10)).toHaveLength(1);
  });

  it('un fallo definitivo queda en FAILED y no se vuelve a tomar', async () => {
    const id = await seedNotification({});
    await notifications.claimDue(NOW, 10);

    await notifications.markFailed(id, 'plantilla inválida', null);

    const row = await prisma.notification.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('FAILED');
    expect(await notifications.claimDue(new Date(NOW.getTime() + 86_400_000), 10)).toHaveLength(0);
  });

  it('el caso de uso completo envía y marca SENT', async () => {
    const id = await seedNotification({});
    const enviados: string[] = [];

    const result = await dispatchNotifications({
      notifications,
      email: {
        send: (message) => {
          enviados.push(message.subject);
          return Promise.resolve();
        },
      },
      clock,
    });

    expect(result).toEqual({ claimed: 1, sent: 1, retrying: 0, abandoned: 0, unrecorded: 0 });
    expect(enviados).toEqual(['Pago aprobado — REC-ENC26-000012']);

    const row = await prisma.notification.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('SENT');
    expect(row.sentAt).not.toBeNull();
  });

  it('una plantilla con variable ausente queda FAILED sin reintento', async () => {
    const id = await seedNotification({ variables: { name: 'Ana' } });

    const result = await dispatchNotifications({
      notifications,
      email: { send: () => Promise.reject(new Error('no debería llamarse')) },
      clock,
    });

    expect(result.abandoned).toBe(1);

    const row = await prisma.notification.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('FAILED');
  });

  /*
   * Recuperación de reclamaciones abandonadas — GOV-008.
   *
   * `claimDue` mueve los envíos a SENDING para que dos réplicas no tomen los
   * mismos, y solo miraba PENDING para leer. Un worker que muriera a mitad de
   * tanda —un despliegue, un SIGKILL, un contenedor sin memoria— dejaba esos
   * envíos muertos para siempre: cuarenta correos aprobados un viernes podían no
   * salir nunca y nadie enterarse.
   */
  describe('reclamaciones abandonadas', () => {
    /** Simula el worker que murió: reclamado hace rato y nunca resuelto. */
    async function abandonada(hace: number): Promise<string> {
      const id = await seedNotification({});
      await notifications.claimDue(NOW, 10);

      await prisma.notification.update({
        where: { id },
        data: { updatedAt: new Date(NOW.getTime() - hace) },
      });

      return id;
    }

    it('vuelve a la cola pasada la ventana', async () => {
      const id = await abandonada(STALE_SENDING_MS + 60_000);

      const reclamadas = await notifications.claimDue(NOW, 10);

      expect(reclamadas.map((n) => n.id)).toEqual([id]);
    });

    /*
     * La otra mitad, y la que evita el daño peor: reclamar un envío todavía en
     * curso produciría un correo duplicado.
     */
    it('no se toca la que aún puede estar en curso', async () => {
      await abandonada(60_000);

      expect(await notifications.claimDue(NOW, 10)).toHaveLength(0);
    });

    /*
     * Esta prueba afirmaba lo contrario —«conserva sus intentos»— y con ello
     * fijaba un reenvío sin fin: una fila que reproduzca el fallo después de
     * enviar se recupera cada diez minutos, el correo sale otra vez en cada
     * ciclo, y `MAX_DELIVERY_ATTEMPTS` no llega a aplicarse nunca porque el
     * contador no avanza. NTF-009 pide que un fallo permanente termine en cola
     * muerta. Recuperar es gastar un intento.
     */
    it('el envío recuperado gasta un intento y conserva su plantilla', async () => {
      const id = await abandonada(STALE_SENDING_MS + 60_000);

      const reclamadas = await notifications.claimDue(NOW, 10);

      expect(reclamadas[0]?.id).toBe(id);
      expect(reclamadas[0]?.subjectTemplate).toBe('Pago aprobado — {{receiptNumber}}');
      expect(reclamadas[0]?.attempts).toBe(1);
    });

    it('una reclamación normal no gasta ningún intento', async () => {
      // La otra mitad de la regla: solo la recuperación cuenta. Si contara
      // también la reclamación normal, cada envío nacería con un intento
      // gastado y la cuota real sería de cuatro, no de cinco.
      const id = await seedNotification({});

      const reclamadas = await notifications.claimDue(NOW, 10);

      expect(reclamadas.map((n) => n.id)).toEqual([id]);
      expect(reclamadas[0]?.attempts).toBe(0);
    });

    it('la recuperación se detiene al agotar la cuota, en vez de reenviar sin fin', async () => {
      const id = await abandonada(STALE_SENDING_MS + 60_000);

      // `updatedAt` se repone en la misma escritura: la columna es `@updatedAt`,
      // así que tocar solo `attempts` la pondría al día y la fila dejaría de
      // parecer abandonada.
      await prisma.notification.update({
        where: { id },
        data: {
          attempts: MAX_DELIVERY_ATTEMPTS - 1,
          updatedAt: new Date(NOW.getTime() - (STALE_SENDING_MS + 60_000)),
        },
      });

      const enviados: unknown[] = [];

      const resultado = await dispatchNotifications({
        notifications,
        email: {
          send: (mensaje) => {
            enviados.push(mensaje);
            return Promise.resolve();
          },
        },
        clock,
      });

      // La recuperación gasta el último intento, así que el despacho encuentra
      // la cuota agotada y no vuelve a enviar.
      expect(enviados).toHaveLength(0);
      expect(resultado.sent).toBe(0);
      expect(resultado.abandoned).toBe(1);

      const fila = await prisma.notification.findUniqueOrThrow({ where: { id } });
      expect(fila.status).toBe('FAILED');
      expect(fila.attempts).toBe(MAX_DELIVERY_ATTEMPTS);
    });

    it('un envío ya enviado no se recupera', async () => {
      const id = await abandonada(STALE_SENDING_MS + 60_000);
      await notifications.markSent(id, NOW);

      expect(await notifications.claimDue(NOW, 10)).toHaveLength(0);
    });
  });
});
