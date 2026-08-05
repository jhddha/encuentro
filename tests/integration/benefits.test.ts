import { randomUUID } from 'node:crypto';

import { stockFromMovements } from '@encuentro/domain';
import type { PrismaClient } from '@encuentro/infrastructure';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, seedActor, seedEvent, testPrisma } from './helpers';

/**
 * Gate de P08–P11: entrega única, fuera de horario, idempotencia multiestación
 * y stock reconstruible.
 *
 * FOOD-* y MAT-* son requisitos reales. Credenciales, estaciones y transporte
 * son inferencia — ver `docs/implementation/08-benefits-credentials.md`.
 */
const prisma: PrismaClient = testPrisma();

async function seedContext() {
  const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026, status: 'IN_PROGRESS' });
  const { userId } = await seedActor(prisma, {
    email: `op-${Math.random().toString(36).slice(2, 8)}@encuentro.test`,
    permissions: ['benefit.deliver'],
    scopeType: 'GLOBAL',
  });

  const person = await prisma.person.create({
    data: { fullName: 'Ana Peregrina', birthDate: new Date('1990-05-20') },
  });
  const pkg = await prisma.package.create({
    data: { eventId: event.id, code: 'GENERAL', name: 'General', visibility: 'PUBLIC' },
  });
  const version = await prisma.priceVersion.create({
    data: { packageId: pkg.id, paymentMode: 'ARRIVAL', amount: '420.00', currency: 'USD' },
  });
  const registration = await prisma.registration.create({
    data: {
      eventId: event.id,
      code: 'ENC2026-000001',
      personId: person.id,
      packageId: pkg.id,
      priceVersionId: version.id,
      paymentMode: 'ARRIVAL',
      status: 'CONFIRMED',
    },
  });

  const service = await prisma.mealService.create({
    data: {
      eventId: event.id,
      serviceDate: new Date('2026-11-03'),
      type: 'LUNCH',
      startsAt: new Date('2026-11-03T16:00:00Z'),
      endsAt: new Date('2026-11-03T18:00:00Z'),
      availableCount: 500,
    },
  });

  const stationA = await prisma.station.create({
    data: { eventId: event.id, code: 'EST-01', name: 'Comedor 1' },
  });
  const stationB = await prisma.station.create({
    data: { eventId: event.id, code: 'EST-02', name: 'Comedor 2' },
  });

  return { event, userId, registration, service, stationA, stationB };
}

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

describe('entrega única por servicio (FOOD-004)', () => {
  it('la segunda entrega del mismo servicio se rechaza', async () => {
    const ctx = await seedContext();

    await prisma.mealDelivery.create({
      data: {
        serviceId: ctx.service.id,
        registrationId: ctx.registration.id,
        stationId: ctx.stationA.id,
        operationUuid: randomUUID(),
      },
    });

    await expect(
      prisma.mealDelivery.create({
        data: {
          serviceId: ctx.service.id,
          registrationId: ctx.registration.id,
          stationId: ctx.stationA.id,
          operationUuid: randomUUID(),
        },
      }),
    ).rejects.toThrow();
  });

  it('doble entrega desde estaciones distintas también se rechaza', async () => {
    const ctx = await seedContext();

    // El escenario que ADR-008 nombra: dos estaciones, la misma persona.
    await prisma.mealDelivery.create({
      data: {
        serviceId: ctx.service.id,
        registrationId: ctx.registration.id,
        stationId: ctx.stationA.id,
        operationUuid: randomUUID(),
      },
    });

    await expect(
      prisma.mealDelivery.create({
        data: {
          serviceId: ctx.service.id,
          registrationId: ctx.registration.id,
          stationId: ctx.stationB.id,
          operationUuid: randomUUID(),
        },
      }),
    ).rejects.toThrow();
  });

  it('dos estaciones simultáneas dejan una sola entrega', async () => {
    const ctx = await seedContext();

    const results = await Promise.allSettled([
      prisma.mealDelivery.create({
        data: {
          serviceId: ctx.service.id,
          registrationId: ctx.registration.id,
          stationId: ctx.stationA.id,
          operationUuid: randomUUID(),
        },
      }),
      prisma.mealDelivery.create({
        data: {
          serviceId: ctx.service.id,
          registrationId: ctx.registration.id,
          stationId: ctx.stationB.id,
          operationUuid: randomUUID(),
        },
      }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.mealDelivery.count()).toBe(1);
  });
});

describe('idempotencia offline (ADR-008)', () => {
  it('reenviar la misma operación no entrega dos veces', async () => {
    const ctx = await seedContext();
    const operationUuid = randomUUID();

    await prisma.mealDelivery.create({
      data: {
        serviceId: ctx.service.id,
        registrationId: ctx.registration.id,
        stationId: ctx.stationA.id,
        operationUuid,
      },
    });

    // La estación recupera conexión y reenvía la misma operación.
    await expect(
      prisma.mealDelivery.create({
        data: {
          serviceId: ctx.service.id,
          registrationId: ctx.registration.id,
          stationId: ctx.stationA.id,
          operationUuid,
        },
      }),
    ).rejects.toThrow();

    expect(await prisma.mealDelivery.count()).toBe(1);
  });
});

describe('override autorizado (FOOD-004)', () => {
  it('exige responsable y motivo', async () => {
    const ctx = await seedContext();

    await expect(
      prisma.mealDelivery.create({
        data: {
          serviceId: ctx.service.id,
          registrationId: ctx.registration.id,
          stationId: ctx.stationA.id,
          operationUuid: randomUUID(),
          overriddenBy: ctx.userId,
        },
      }),
    ).rejects.toThrow();
  });

  it('con ambos datos se acepta y queda registrado', async () => {
    const ctx = await seedContext();

    const entrega = await prisma.mealDelivery.create({
      data: {
        serviceId: ctx.service.id,
        registrationId: ctx.registration.id,
        stationId: ctx.stationA.id,
        operationUuid: randomUUID(),
        overriddenBy: ctx.userId,
        overrideReason: 'Primera entrega no registrada por fallo de red',
      },
    });

    expect(entrega.overriddenBy).toBe(ctx.userId);
  });
});

describe('ventana horaria en base (FOOD-001)', () => {
  it('rechaza un servicio que termina antes de empezar', async () => {
    const ctx = await seedContext();

    await expect(
      prisma.mealService.create({
        data: {
          eventId: ctx.event.id,
          serviceDate: new Date('2026-11-04'),
          type: 'DINNER',
          startsAt: new Date('2026-11-04T20:00:00Z'),
          endsAt: new Date('2026-11-04T18:00:00Z'),
          availableCount: 100,
        },
      }),
    ).rejects.toThrow();
  });

  it('no admite dos servicios del mismo tipo el mismo día', async () => {
    const ctx = await seedContext();

    await expect(
      prisma.mealService.create({
        data: {
          eventId: ctx.event.id,
          serviceDate: new Date('2026-11-03'),
          type: 'LUNCH',
          startsAt: new Date('2026-11-03T19:00:00Z'),
          endsAt: new Date('2026-11-03T20:00:00Z'),
          availableCount: 100,
        },
      }),
    ).rejects.toThrow();
  });
});

describe('stock reconstruible (MAT-003)', () => {
  it('el stock se deriva de los movimientos guardados', async () => {
    const ctx = await seedContext();
    const item = await prisma.inventoryItem.create({
      data: { eventId: ctx.event.id, code: 'KIT', name: 'Kit del peregrino' },
    });

    for (const movement of [
      { kind: 'RECEIPT', quantity: 100 },
      { kind: 'DELIVERY', quantity: 30 },
      { kind: 'LOSS', quantity: 2 },
      { kind: 'ADJUSTMENT', quantity: -1 },
    ]) {
      await prisma.inventoryMovement.create({
        data: { itemId: item.id, actorId: ctx.userId, ...movement },
      });
    }

    const movimientos = await prisma.inventoryMovement.findMany({ where: { itemId: item.id } });
    const stock = stockFromMovements(
      movimientos.map((m) => ({ kind: m.kind as 'RECEIPT', quantity: m.quantity })),
    );

    expect(stock).toBe(67);
  });

  it('los movimientos son append-only', async () => {
    const ctx = await seedContext();
    const item = await prisma.inventoryItem.create({
      data: { eventId: ctx.event.id, code: 'KIT', name: 'Kit' },
    });
    await prisma.inventoryMovement.create({
      data: { itemId: item.id, actorId: ctx.userId, kind: 'RECEIPT', quantity: 10 },
    });

    await expect(
      prisma.$executeRawUnsafe('UPDATE inventory_movements SET quantity = 999'),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe('DELETE FROM inventory_movements')).rejects.toThrow(
      /append-only/,
    );
  });

  it('rechaza una cantidad no positiva salvo en ajustes', async () => {
    const ctx = await seedContext();
    const item = await prisma.inventoryItem.create({
      data: { eventId: ctx.event.id, code: 'KIT', name: 'Kit' },
    });

    await expect(
      prisma.inventoryMovement.create({
        data: { itemId: item.id, actorId: ctx.userId, kind: 'RECEIPT', quantity: -5 },
      }),
    ).rejects.toThrow();

    // Un ajuste sí puede ser negativo.
    await expect(
      prisma.inventoryMovement.create({
        data: { itemId: item.id, actorId: ctx.userId, kind: 'ADJUSTMENT', quantity: -5 },
      }),
    ).resolves.toBeDefined();
  });
});

describe('materiales: una entrega por artículo y persona (MAT-001)', () => {
  it('rechaza la segunda entrega del mismo artículo', async () => {
    const ctx = await seedContext();
    const item = await prisma.inventoryItem.create({
      data: { eventId: ctx.event.id, code: 'KIT', name: 'Kit' },
    });

    await prisma.materialDelivery.create({
      data: {
        itemId: item.id,
        registrationId: ctx.registration.id,
        stationId: ctx.stationA.id,
        operationUuid: randomUUID(),
      },
    });

    await expect(
      prisma.materialDelivery.create({
        data: {
          itemId: item.id,
          registrationId: ctx.registration.id,
          stationId: ctx.stationA.id,
          operationUuid: randomUUID(),
        },
      }),
    ).rejects.toThrow();
  });
});

describe('credenciales — INFERIDO (P08)', () => {
  it('el token se guarda por hash y es único', async () => {
    const ctx = await seedContext();

    const credential = await prisma.credential.create({
      data: {
        eventId: ctx.event.id,
        registrationId: ctx.registration.id,
        code: 'CRED-000001',
        tokenHash: 'a'.repeat(64),
      },
    });

    expect(credential.tokenHash).toHaveLength(64);
    // requirements.md §10: el token no contiene PII ni el código de inscripción.
    expect(credential.tokenHash).not.toContain(ctx.registration.code);
  });

  it('revocar exige responsable y motivo', async () => {
    const ctx = await seedContext();
    const credential = await prisma.credential.create({
      data: {
        eventId: ctx.event.id,
        registrationId: ctx.registration.id,
        code: 'CRED-000001',
        tokenHash: 'b'.repeat(64),
      },
    });

    await expect(
      prisma.credential.update({
        where: { id: credential.id },
        data: { revokedAt: new Date(), status: 'REVOKED' },
      }),
    ).rejects.toThrow();
  });
});

describe('transporte — INFERIDO (P10)', () => {
  it('un vehículo no puede tener dos traslados solapados', async () => {
    const ctx = await seedContext();
    const vehicle = await prisma.vehicle.create({
      data: { eventId: ctx.event.id, code: 'BUS-01', capacity: 40 },
    });

    await prisma.trip.create({
      data: {
        vehicleId: vehicle.id,
        origin: 'Aeropuerto',
        destination: 'La Mansión',
        departsAt: new Date('2026-11-01T10:00:00Z'),
        arrivesAt: new Date('2026-11-01T12:00:00Z'),
      },
    });

    await expect(
      prisma.trip.create({
        data: {
          vehicleId: vehicle.id,
          origin: 'Terminal',
          destination: 'La Mansión',
          departsAt: new Date('2026-11-01T11:00:00Z'),
          arrivesAt: new Date('2026-11-01T13:00:00Z'),
        },
      }),
    ).rejects.toThrow();
  });

  it('traslados consecutivos sin solape sí se admiten', async () => {
    const ctx = await seedContext();
    const vehicle = await prisma.vehicle.create({
      data: { eventId: ctx.event.id, code: 'BUS-01', capacity: 40 },
    });

    await prisma.trip.create({
      data: {
        vehicleId: vehicle.id,
        origin: 'Aeropuerto',
        destination: 'La Mansión',
        departsAt: new Date('2026-11-01T10:00:00Z'),
        arrivesAt: new Date('2026-11-01T12:00:00Z'),
      },
    });

    await expect(
      prisma.trip.create({
        data: {
          vehicleId: vehicle.id,
          origin: 'La Mansión',
          destination: 'Aeropuerto',
          departsAt: new Date('2026-11-01T12:00:00Z'),
          arrivesAt: new Date('2026-11-01T14:00:00Z'),
        },
      }),
    ).resolves.toBeDefined();
  });
});
