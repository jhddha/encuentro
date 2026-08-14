import { assignRoom, chooseHotel, expireHeldReservations } from '@encuentro/application';
import { HELD_DURATION_MS, type Actor } from '@encuentro/domain';
import {
  createLodgingRepository,
  createReservationRepository,
  type PrismaClient,
} from '@encuentro/infrastructure';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, seedEvent, testPrisma } from './helpers';

/**
 * Gate de los casos de uso de hospedaje — HOS-001, HOS-002, HOS-005, HOS-012.
 *
 * Va aparte de `lodging.test.ts`, que cubre lo que **la base** garantiza por su
 * cuenta: los CHECK de la política, el índice único sobre `(room_id,
 * bed_index)` bajo diez intentos simultáneos, `held_until` obligatorio en
 * `HELD`, el aislamiento entre gestiones. Aquí se prueba lo que garantizan
 * `chooseHotel` y `assignRoom`, que es otra capa y otro mecanismo.
 *
 * La diferencia no es de matiz. Aquel archivo demuestra que dos personas no
 * ocupan **la misma cama**; este, que dos personas no entran en **el mismo
 * hotel lleno**. Un `HELD` todavía no tiene cama —la asigna Hospedaje
 * (HOS-001)—, así que el índice único no interviene y lo único que impide
 * sobrevender el hotel es el cerrojo de aviso del repositorio. Sin él, las dos
 * peticiones leen «queda una» y las dos entran, con todas las restricciones de
 * la base intactas.
 */
const prisma: PrismaClient = testPrisma();
const BOB = 'BOB';

const lodging = createLodgingRepository(prisma);
const reservations = createReservationRepository(prisma);

/**
 * El reloj falso arranca en la hora real, y no en una fecha fija.
 *
 * `held_until` lo escribe la aplicación con este reloj; `created_at` lo pone la
 * base con el suyo. El worker exige que **los dos** digan que la retención
 * venció antes de liberarla, precisamente para que una columna mal escrita no
 * suelte una cama. Con una fecha inventada en el pasado los dos reloj es
 * discrepan y no expira nada, que es el comportamiento correcto y aquí sería un
 * fallo de la prueba y no del código.
 *
 * Deja dicho de paso algo que conviene saber: **la expiración depende de que el
 * reloj de la aplicación y el de Postgres coincidan.** Hoy comparten máquina
 * (DEC-001) y no es un problema; el día que no la compartan, un desfase mayor
 * que la retención dejaría de liberar camas en silencio.
 */
let reloj = new Date();
const clock = { now: () => reloj };

const deps = { lodging, clock };

interface Escenario {
  readonly eventId: string;
  readonly hotelId: string;
  readonly roomId: string;
  readonly peregrinos: readonly { readonly registrationId: string; readonly actor: Actor }[];
  readonly hospedaje: Actor;
}

function hospedajeActor(userId: string, eventId: string, permisos: readonly string[]): Actor {
  return { userId, assignments: [{ permissions: permisos, scope: { type: 'EVENT', eventId } }] };
}

/**
 * Una gestión con un hotel de `capacidad` plazas y `cuantos` peregrinos
 * anticipados con su pago aplicado.
 *
 * El pago se **aplica** contra el cargo, no solo se aprueba: REG-020 mide
 * contra lo asignado, que es lo que de verdad bajó el saldo.
 */
async function sembrar(options: { capacidad: number; cuantos: number }): Promise<Escenario> {
  const event = await seedEvent(prisma, {
    code: `ENC-H${String(Math.floor(Math.random() * 100_000))}`,
    year: 2030 + Math.floor(Math.random() * 900),
    status: 'ACTIVE',
    currency: BOB,
  });

  await prisma.eventLodgingPolicy.create({
    data: {
      eventId: event.id,
      nightCount: 7,
      checkInDate: new Date('2026-11-01T00:00:00Z'),
      checkOutDate: new Date('2026-11-08T00:00:00Z'),
    },
  });

  const hotel = await prisma.hotel.create({
    data: { eventId: event.id, code: 'CENTRAL', name: 'Hotel Central' },
  });

  const room = await prisma.room.create({
    data: { hotelId: hotel.id, code: '101', capacity: options.capacidad },
  });

  const pkg = await prisma.package.create({
    data: { eventId: event.id, code: 'GENERAL', name: 'General', visibility: 'PUBLIC' },
  });

  const price = await prisma.priceVersion.create({
    data: {
      packageId: pkg.id,
      paymentMode: 'ADVANCE',
      amount: '400.00',
      currency: BOB,
      startsAt: new Date('2026-07-01T00:00:00Z'),
      endsAt: new Date('2026-10-15T23:59:59Z'),
      minPaymentPercent: 50,
    },
  });

  const peregrinos = [];

  for (let i = 0; i < options.cuantos; i += 1) {
    const user = await prisma.user.create({
      data: { email: `peregrino-${String(i)}-${event.code}@encuentro.invalid`, displayName: 'P' },
    });
    const person = await prisma.person.create({
      data: {
        userId: user.id,
        fullName: `Peregrino ${String(i)}`,
        birthDate: new Date('1990-01-01'),
      },
    });
    const registration = await prisma.registration.create({
      data: {
        eventId: event.id,
        code: `REG-${event.code}-${String(i)}`,
        personId: person.id,
        packageId: pkg.id,
        priceVersionId: price.id,
        paymentMode: 'ADVANCE',
        status: 'CONFIRMED',
      },
    });
    const charge = await prisma.charge.create({
      data: {
        registrationId: registration.id,
        concept: 'PACKAGE',
        amount: '400.00',
        currency: BOB,
        snapshot: { packageCode: 'GENERAL' },
      },
    });

    const revisor = await prisma.user.create({
      data: { email: `revisor-${String(i)}-${event.code}@encuentro.invalid`, displayName: 'R' },
    });

    // 200.00 sobre 400.00: justo el 50 % que REG-020 exige.
    const payment = await prisma.payment.create({
      data: {
        eventId: event.id,
        registrationId: registration.id,
        amount: '200.00',
        currency: BOB,
        method: 'MANUAL_PROOF',
        status: 'SUCCEEDED',
        approvedBy: revisor.id,
      },
    });

    await prisma.paymentAllocation.create({
      data: { paymentId: payment.id, chargeId: charge.id, amount: '200.00', currency: BOB },
    });

    peregrinos.push({
      registrationId: registration.id,
      actor: { userId: user.id, assignments: [] },
    });
  }

  const encargado = await prisma.user.create({
    data: { email: `hospedaje-${event.code}@encuentro.invalid`, displayName: 'Hospedaje' },
  });

  return {
    eventId: event.id,
    hotelId: hotel.id,
    roomId: room.id,
    peregrinos,
    hospedaje: hospedajeActor(encargado.id, event.id, ['lodging.assign_room']),
  };
}

/**
 * Peregrino sembrado, sin aserción de no-nulo.
 *
 * `e.peregrinos[0]!` calla un error real: si el escenario no sembró a nadie, la
 * prueba fallaría más adelante con un mensaje que no señala la causa. Así dice
 * lo que pasó.
 */
function peregrinoDe(e: Escenario, indice: number): { registrationId: string; actor: Actor } {
  const encontrado = e.peregrinos[indice];

  if (encontrado === undefined) {
    throw new Error(`El escenario no sembró el peregrino ${String(indice)}.`);
  }

  return encontrado;
}

beforeEach(async () => {
  reloj = new Date();
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('el último cupo — HOS-002', () => {
  /*
   * El escenario obligatorio del plan de ejecución.
   *
   * Un `HELD` todavía no tiene cama —la asigna Hospedaje (HOS-001)—, así que
   * el índice único sobre (room_id, bed_index) no interviene: lo único que
   * impide vender dos veces la última plaza es el cerrojo de aviso por hotel.
   * Sin él, las dos peticiones leen «queda una» y las dos entran.
   */
  it('dos peticiones simultáneas por la última plaza: solo una entra', async () => {
    const e = await sembrar({ capacidad: 1, cuantos: 2 });

    const resultados = await Promise.allSettled(
      e.peregrinos.map((p) =>
        chooseHotel(deps, p.actor, {
          eventId: e.eventId,
          registrationId: p.registrationId,
          hotelId: e.hotelId,
        }),
      ),
    );

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.reservation.count({ where: { hotelId: e.hotelId } })).toBe(1);

    const rechazada = resultados.find((r) => r.status === 'rejected');
    expect(rechazada?.reason).toMatchObject({ code: 'LODGING_CAPACITY_EXHAUSTED' });
  });

  it('cuatro a la vez sobre dos plazas: entran exactamente dos', async () => {
    const e = await sembrar({ capacidad: 2, cuantos: 4 });

    const resultados = await Promise.allSettled(
      e.peregrinos.map((p) =>
        chooseHotel(deps, p.actor, {
          eventId: e.eventId,
          registrationId: p.registrationId,
          hotelId: e.hotelId,
        }),
      ),
    );

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(
      await prisma.reservation.count({ where: { status: { in: ['HELD', 'CONFIRMED'] } } }),
    ).toBe(2);
  });

  /*
   * Una plaza liberada vuelve al inventario. Es lo que distingue contar
   * reservas vivas de llevar un contador: el contador habría que acordarse de
   * decrementarlo.
   */
  it('lo liberado vuelve a estar disponible', async () => {
    const e = await sembrar({ capacidad: 1, cuantos: 2 });
    const primero = peregrinoDe(e, 0);
    const segundo = peregrinoDe(e, 1);

    const id = await chooseHotel(deps, primero.actor, {
      eventId: e.eventId,
      registrationId: primero.registrationId,
      hotelId: e.hotelId,
    });

    await expect(
      chooseHotel(deps, segundo.actor, {
        eventId: e.eventId,
        registrationId: segundo.registrationId,
        hotelId: e.hotelId,
      }),
    ).rejects.toMatchObject({ code: 'LODGING_CAPACITY_EXHAUSTED' });

    await prisma.reservation.update({
      where: { id },
      data: { status: 'RELEASED', heldUntil: null },
    });

    await expect(
      chooseHotel(deps, segundo.actor, {
        eventId: e.eventId,
        registrationId: segundo.registrationId,
        hotelId: e.hotelId,
      }),
    ).resolves.toBeTypeOf('string');
  });
});

describe('una inscripción, una reserva viva', () => {
  it('la base lo impide aunque el caso de uso fallara', async () => {
    const e = await sembrar({ capacidad: 4, cuantos: 1 });
    const p = peregrinoDe(e, 0);

    await chooseHotel(deps, p.actor, {
      eventId: e.eventId,
      registrationId: p.registrationId,
      hotelId: e.hotelId,
    });

    // Saltándose el caso de uso: el índice único parcial es la garantía.
    await expect(
      prisma.reservation.create({
        data: {
          eventId: e.eventId,
          registrationId: p.registrationId,
          hotelId: e.hotelId,
          checkInDate: new Date('2026-11-01T00:00:00Z'),
          checkOutDate: new Date('2026-11-08T00:00:00Z'),
          nightCount: 7,
          status: 'HELD',
          heldUntil: new Date(reloj.getTime() + HELD_DURATION_MS),
        },
      }),
    ).rejects.toThrow();
  });
});

describe('asignación de habitación — HOS-001, HOS-005', () => {
  async function conReserva(capacidad = 4) {
    const e = await sembrar({ capacidad, cuantos: 1 });
    const p = peregrinoDe(e, 0);

    const reservationId = await chooseHotel(deps, p.actor, {
      eventId: e.eventId,
      registrationId: p.registrationId,
      hotelId: e.hotelId,
    });

    return { e, reservationId };
  }

  it('confirma la reserva y deja de estar sujeta a expiración', async () => {
    const { e, reservationId } = await conReserva();

    const antes = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });

    await assignRoom(deps, e.hospedaje, {
      eventId: e.eventId,
      reservationId,
      expectedVersion: antes.version,
      roomId: e.roomId,
    });

    const despues = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });

    expect(despues.status).toBe('CONFIRMED');
    expect(despues.roomId).toBe(e.roomId);
    expect(despues.bedIndex).toBe(1);
    // DEC-005: el CHECK de la base exige que sea nulo fuera de `HELD`.
    expect(despues.heldUntil).toBeNull();
  });

  /*
   * HOS-005: el cambio libera y toma plaza a la vez. Si no fuera atómico
   * quedaría una plaza perdida —el índice único la creería tomada y nadie
   * podría pedirla— o duplicada.
   */
  it('el cambio de habitación no deja la plaza anterior ocupada', async () => {
    const { e, reservationId } = await conReserva();

    const otra = await prisma.room.create({
      data: { hotelId: e.hotelId, code: '202', capacity: 2 },
    });

    const v0 = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });

    await assignRoom(deps, e.hospedaje, {
      eventId: e.eventId,
      reservationId,
      expectedVersion: v0.version,
      roomId: e.roomId,
    });

    const v1 = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });

    await assignRoom(deps, e.hospedaje, {
      eventId: e.eventId,
      reservationId,
      expectedVersion: v1.version,
      roomId: otra.id,
    });

    const final = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });

    expect(final.roomId).toBe(otra.id);
    // Y la habitación original vuelve a tener sus cuatro plazas libres.
    expect(
      await prisma.reservation.count({
        where: { roomId: e.roomId, status: { in: ['HELD', 'CONFIRMED'] } },
      }),
    ).toBe(0);
  });

  it('la plaza fuera de la capacidad la rechaza la base (HOS-002)', async () => {
    const { e, reservationId } = await conReserva(2);
    const v0 = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });

    /*
     * Con el permiso de sobreasignar y motivo, el dominio deja pasar la
     * operación — y el disparador de la base la frena igualmente. Las dos
     * barreras son distintas a propósito: HOS-006 autoriza doblar una plaza
     * existente, no inventar una que la habitación no tiene.
     */
    await expect(
      assignRoom(
        deps,
        hospedajeActor(e.hospedaje.userId, e.eventId, [
          'lodging.assign_room',
          'lodging.override_capacity',
        ]),
        {
          eventId: e.eventId,
          reservationId,
          expectedVersion: v0.version,
          roomId: e.roomId,
          bedIndex: 9,
          overrideReason: 'Cama supletoria.',
        },
      ),
    ).rejects.toThrow();
  });

  it('deja rastro en auditoría con la gestión puesta (GOV-005)', async () => {
    const { e, reservationId } = await conReserva();
    const v0 = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });

    await assignRoom(deps, e.hospedaje, {
      eventId: e.eventId,
      reservationId,
      expectedVersion: v0.version,
      roomId: e.roomId,
    });

    const rastro = await prisma.auditLog.findMany({
      where: { entity: 'reservation', entityId: reservationId },
      orderBy: { createdAt: 'asc' },
      select: { action: true, eventId: true },
    });

    expect(rastro.map((r) => r.action)).toEqual(['lodging.hold', 'lodging.assign_room']);
    // La pantalla de auditoría filtra por gestión: sin esto no aparecería.
    expect(rastro.every((r) => r.eventId === e.eventId)).toBe(true);
  });
});

describe('la reserva confirmada no se libera — HOS-012, DEC-005', () => {
  /*
   * El segundo escenario obligatorio del plan. La retención vencida se libera;
   * la confirmada sobrevive al mismo barrido, aunque su `createdAt` sea igual
   * de antiguo.
   */
  it('el worker expira la retención vencida y no toca la confirmada', async () => {
    const e = await sembrar({ capacidad: 4, cuantos: 2 });
    const uno = peregrinoDe(e, 0);
    const dos = peregrinoDe(e, 1);

    const retenida = await chooseHotel(deps, uno.actor, {
      eventId: e.eventId,
      registrationId: uno.registrationId,
      hotelId: e.hotelId,
    });

    const confirmada = await chooseHotel(deps, dos.actor, {
      eventId: e.eventId,
      registrationId: dos.registrationId,
      hotelId: e.hotelId,
    });

    const v0 = await prisma.reservation.findUniqueOrThrow({ where: { id: confirmada } });

    await assignRoom(deps, e.hospedaje, {
      eventId: e.eventId,
      reservationId: confirmada,
      expectedVersion: v0.version,
      roomId: e.roomId,
    });

    // Un minuto después de que venza la retención.
    reloj = new Date(reloj.getTime() + HELD_DURATION_MS + 60_000);

    const sistema = await prisma.user.create({
      data: { email: `sistema-${e.eventId}@encuentro.invalid`, displayName: 'Sistema' },
    });

    const resultado = await expireHeldReservations({
      reservations,
      clock,
      systemActorId: sistema.id,
    });

    expect(resultado.expired).toBe(1);

    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: retenida } })).status).toBe(
      'EXPIRED',
    );
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: confirmada } })).status).toBe(
      'CONFIRMED',
    );
  });
});
