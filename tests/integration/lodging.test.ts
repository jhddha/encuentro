import { heldExpiresAt } from '@encuentro/domain';
import type { PrismaClient } from '@encuentro/infrastructure';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, seedEvent, testPrisma } from './helpers';

/**
 * Gate de P06: último cupo concurrente y llegada tardía.
 *
 * Las reglas de hospedaje van contra lo que un sistema de reservas hace por
 * costumbre —no recortar el rango, no bajar el precio, no liberar la reserva—,
 * así que conviene comprobarlas contra la base y no solo en el dominio.
 */
const prisma: PrismaClient = testPrisma();

const CHECK_IN = new Date('2026-11-01T00:00:00Z');
const CHECK_OUT = new Date('2026-11-08T00:00:00Z');
const NIGHTS = 7;

async function seedLodging(eventId: string, capacity: number) {
  const hotel = await prisma.hotel.create({
    data: { eventId, code: 'HOTEL-1', name: 'Hotel Central' },
  });
  const room = await prisma.room.create({
    data: { hotelId: hotel.id, code: '101', capacity },
  });
  return { hotel, room };
}

async function seedRegistration(eventId: string, name: string) {
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

  return await prisma.registration.create({
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
}

function reservationData(eventId: string, registrationId: string, hotelId: string) {
  return {
    eventId,
    registrationId,
    hotelId,
    checkInDate: CHECK_IN,
    checkOutDate: CHECK_OUT,
    nightCount: NIGHTS,
  };
}

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

describe('política de noches configurable (HOS-001)', () => {
  it('acepta la referencia de 7 noches', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const policy = await prisma.eventLodgingPolicy.create({
      data: {
        eventId: event.id,
        nightCount: 7,
        checkInDate: CHECK_IN,
        checkOutDate: CHECK_OUT,
      },
    });
    expect(policy.nightCount).toBe(7);
  });

  it('acepta otras cantidades — nada está fijado en 7', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const policy = await prisma.eventLodgingPolicy.create({
      data: {
        eventId: event.id,
        nightCount: 3,
        checkInDate: CHECK_IN,
        checkOutDate: new Date('2026-11-04T00:00:00Z'),
      },
    });
    expect(policy.nightCount).toBe(3);
  });

  it('rechaza una política cuyas fechas no cuadran con sus noches', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    await expect(
      prisma.eventLodgingPolicy.create({
        data: {
          eventId: event.id,
          nightCount: 7,
          checkInDate: CHECK_IN,
          // Solo 5 noches, pero declara 7.
          checkOutDate: new Date('2026-11-06T00:00:00Z'),
        },
      }),
    ).rejects.toThrow();
  });
});

describe('último cupo concurrente (HOS-008)', () => {
  it('dos personas no ocupan la misma plaza', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { hotel, room } = await seedLodging(event.id, 1);
    const a = await seedRegistration(event.id, 'Ana');
    const b = await seedRegistration(event.id, 'Bruno');

    // Ambas piden la plaza 1 de una habitación con capacidad 1.
    const results = await Promise.allSettled([
      prisma.reservation.create({
        data: {
          ...reservationData(event.id, a.id, hotel.id),
          roomId: room.id,
          bedIndex: 1,
          status: 'CONFIRMED',
        },
      }),
      prisma.reservation.create({
        data: {
          ...reservationData(event.id, b.id, hotel.id),
          roomId: room.id,
          bedIndex: 1,
          status: 'CONFIRMED',
        },
      }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    const vivas = await prisma.reservation.count({
      where: { roomId: room.id, status: { in: ['HELD', 'CONFIRMED'] } },
    });
    expect(vivas).toBe(1);
  });

  it('diez intentos simultáneos sobre la misma plaza dejan una sola reserva', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { hotel, room } = await seedLodging(event.id, 1);

    const registrations = await Promise.all(
      Array.from({ length: 10 }, (_, i) => seedRegistration(event.id, `Persona ${String(i)}`)),
    );

    const results = await Promise.allSettled(
      registrations.map((reg) =>
        prisma.reservation.create({
          data: {
            ...reservationData(event.id, reg.id, hotel.id),
            roomId: room.id,
            bedIndex: 1,
            status: 'CONFIRMED',
          },
        }),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('liberar una plaza la deja disponible otra vez', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { hotel, room } = await seedLodging(event.id, 1);
    const a = await seedRegistration(event.id, 'Ana');
    const b = await seedRegistration(event.id, 'Bruno');

    const primera = await prisma.reservation.create({
      data: {
        ...reservationData(event.id, a.id, hotel.id),
        roomId: room.id,
        bedIndex: 1,
        status: 'CONFIRMED',
      },
    });

    // El índice único es parcial: solo cuenta HELD y CONFIRMED.
    await prisma.reservation.update({
      where: { id: primera.id },
      data: { status: 'RELEASED' },
    });

    await expect(
      prisma.reservation.create({
        data: {
          ...reservationData(event.id, b.id, hotel.id),
          roomId: room.id,
          bedIndex: 1,
          status: 'CONFIRMED',
        },
      }),
    ).resolves.toBeDefined();
  });

  it('rechaza una plaza fuera de la capacidad de la habitación', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { hotel, room } = await seedLodging(event.id, 2);
    const a = await seedRegistration(event.id, 'Ana');

    await expect(
      prisma.reservation.create({
        data: {
          ...reservationData(event.id, a.id, hotel.id),
          roomId: room.id,
          bedIndex: 3,
          status: 'CONFIRMED',
        },
      }),
    ).rejects.toThrow();
  });

  it('una inscripción no tiene dos reservas vivas a la vez', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { hotel, room } = await seedLodging(event.id, 5);
    const a = await seedRegistration(event.id, 'Ana');

    await prisma.reservation.create({
      data: {
        ...reservationData(event.id, a.id, hotel.id),
        roomId: room.id,
        bedIndex: 1,
        status: 'CONFIRMED',
      },
    });

    await expect(
      prisma.reservation.create({
        data: {
          ...reservationData(event.id, a.id, hotel.id),
          roomId: room.id,
          bedIndex: 2,
          status: 'CONFIRMED',
        },
      }),
    ).rejects.toThrow();
  });
});

describe('llegada tardía (HOS-002, HOS-003, DEC-004)', () => {
  it('una reserva CONFIRMED sigue intacta con la persona ausente el primer día', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026, status: 'IN_PROGRESS' });
    const { hotel, room } = await seedLodging(event.id, 5);
    const a = await seedRegistration(event.id, 'Ana');

    const reserva = await prisma.reservation.create({
      data: {
        ...reservationData(event.id, a.id, hotel.id),
        roomId: room.id,
        bedIndex: 1,
        status: 'CONFIRMED',
      },
    });

    // Llega el día 5 de 7. HOS-002: no reescribe la reserva.
    await prisma.registration.update({
      where: { id: a.id },
      data: {
        actualArrivalAt: new Date('2026-11-05T18:00:00Z'),
        attendanceStatus: 'CHECKED_IN',
      },
    });

    const despues = await prisma.reservation.findUniqueOrThrow({ where: { id: reserva.id } });
    expect(despues.status).toBe('CONFIRMED');
    expect(despues.nightCount).toBe(NIGHTS);
    expect(despues.checkInDate).toEqual(CHECK_IN);
    expect(despues.checkOutDate).toEqual(CHECK_OUT);
  });

  it('una reserva CONFIRMED no puede llevar held_until', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { hotel, room } = await seedLodging(event.id, 5);
    const a = await seedRegistration(event.id, 'Ana');

    // Si una CONFIRMED conservara `held_until`, un worker mal escrito podría
    // expirarla — justo lo que HOS-003 prohíbe. El CHECK lo impide.
    await expect(
      prisma.reservation.create({
        data: {
          ...reservationData(event.id, a.id, hotel.id),
          roomId: room.id,
          bedIndex: 1,
          status: 'CONFIRMED',
          heldUntil: new Date('2026-09-01T10:30:00Z'),
        },
      }),
    ).rejects.toThrow();
  });

  it('una HELD sin held_until tampoco se admite', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { hotel, room } = await seedLodging(event.id, 5);
    const a = await seedRegistration(event.id, 'Ana');

    await expect(
      prisma.reservation.create({
        data: {
          ...reservationData(event.id, a.id, hotel.id),
          roomId: room.id,
          bedIndex: 1,
          status: 'HELD',
        },
      }),
    ).rejects.toThrow();
  });
});

describe('expiración de HELD (DEC-005)', () => {
  it('solo alcanza a las retenciones, nunca a las confirmadas', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { hotel, room } = await seedLodging(event.id, 5);
    const a = await seedRegistration(event.id, 'Ana');
    const b = await seedRegistration(event.id, 'Bruno');

    const creada = new Date('2026-09-01T10:00:00Z');

    await prisma.reservation.create({
      data: {
        ...reservationData(event.id, a.id, hotel.id),
        roomId: room.id,
        bedIndex: 1,
        status: 'HELD',
        heldUntil: heldExpiresAt(creada),
      },
    });

    await prisma.reservation.create({
      data: {
        ...reservationData(event.id, b.id, hotel.id),
        roomId: room.id,
        bedIndex: 2,
        status: 'CONFIRMED',
      },
    });

    // Consulta equivalente a la del worker: filtra por HELD y por vencimiento.
    const ahora = new Date('2026-09-01T10:31:00Z');
    const expirables = await prisma.reservation.findMany({
      where: { status: 'HELD', heldUntil: { lte: ahora } },
    });

    expect(expirables).toHaveLength(1);
    expect(expirables[0]?.registrationId).toBe(a.id);
  });

  it('una retención dentro de sus 30 minutos no se toca', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { hotel, room } = await seedLodging(event.id, 5);
    const a = await seedRegistration(event.id, 'Ana');

    const creada = new Date('2026-09-01T10:00:00Z');
    await prisma.reservation.create({
      data: {
        ...reservationData(event.id, a.id, hotel.id),
        roomId: room.id,
        bedIndex: 1,
        status: 'HELD',
        heldUntil: heldExpiresAt(creada),
      },
    });

    const expirables = await prisma.reservation.findMany({
      where: { status: 'HELD', heldUntil: { lte: new Date('2026-09-01T10:29:00Z') } },
    });

    expect(expirables).toHaveLength(0);
  });
});

describe('aislamiento entre gestiones', () => {
  it('el inventario de una gestión no se ve desde otra', async () => {
    const a = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const b = await seedEvent(prisma, { code: 'ENC2027', year: 2027 });
    await seedLodging(a.id, 5);

    expect(await prisma.hotel.count({ where: { eventId: b.id } })).toBe(0);
  });
});
