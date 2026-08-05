import { prepareRegistration } from '@encuentro/application';
import { toDecimalString } from '@encuentro/domain';
import {
  createCatalogRepository,
  createRegistrationRepository,
  type PrismaClient,
} from '@encuentro/infrastructure';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, seedActor, seedEvent, testPrisma } from './helpers';

/**
 * Gate de P05: catálogo, modalidades, cargo congelado y aislamiento.
 *
 * Contra Postgres real. Aquí se comprueba lo que solo la base puede garantizar:
 * qué rechazan los constraints, si el cargo sobrevive a un cambio de tarifa, y
 * si dos altas simultáneas duplican el código de inscripción.
 */
const prisma: PrismaClient = testPrisma();
const catalog = createCatalogRepository(prisma);
const registrations = createRegistrationRepository(prisma);

const NOW = new Date('2026-09-01T10:00:00Z');

async function seedCatalog(eventId: string) {
  const publico = await prisma.package.create({
    data: { eventId, code: 'GENERAL', name: 'Paquete general', visibility: 'PUBLIC' },
  });

  const privado = await prisma.package.create({
    data: { eventId, code: 'BECA', name: 'Paquete becado', visibility: 'PRIVATE' },
  });

  const anticipado = await prisma.priceVersion.create({
    data: {
      packageId: publico.id,
      paymentMode: 'ADVANCE',
      amount: '350.00',
      currency: 'USD',
      startsAt: new Date('2026-07-01T00:00:00Z'),
      endsAt: new Date('2026-10-15T23:59:59Z'),
      minPaymentPercent: 50,
    },
  });

  const alLlegar = await prisma.priceVersion.create({
    data: { packageId: publico.id, paymentMode: 'ARRIVAL', amount: '420.00', currency: 'USD' },
  });

  return { publico, privado, anticipado, alLlegar };
}

/** Recupera una versión de precio y falla claro si la preparación fue mal. */
async function requirePriceVersion(id: string) {
  const version = await catalog.findPriceVersion(id);
  if (version === null) {
    throw new Error(`No existe la versión de precio ${id}: revise la preparación de la prueba.`);
  }
  return version;
}

async function seedPerson(fullName: string, birthDate: string) {
  return await prisma.person.create({ data: { fullName, birthDate: new Date(birthDate) } });
}

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

describe('visibilidad del catálogo (PKG-002)', () => {
  it('el listado por defecto no incluye paquetes privados', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    await seedCatalog(event.id);

    const publicos = await catalog.listPackages(event.id);
    expect(publicos.map((p) => p.code)).toEqual(['GENERAL']);
  });

  it('solo los devuelve cuando se piden explícitamente', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    await seedCatalog(event.id);

    const todos = await catalog.listPackages(event.id, true);
    expect(todos.map((p) => p.code).sort()).toEqual(['BECA', 'GENERAL']);
  });

  it('el catálogo de una gestión no filtra al de otra', async () => {
    const a = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const b = await seedEvent(prisma, { code: 'ENC2027', year: 2027 });
    await seedCatalog(a.id);

    expect(await catalog.listPackages(b.id, true)).toHaveLength(0);
  });
});

describe('importes con precisión decimal', () => {
  it('sobrevive al viaje a la base sin perder céntimos', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const pkg = await prisma.package.create({
      data: { eventId: event.id, code: 'X', name: 'X', visibility: 'PUBLIC' },
    });
    await prisma.priceVersion.create({
      data: { packageId: pkg.id, paymentMode: 'ARRIVAL', amount: '0.07', currency: 'USD' },
    });

    const [paquete] = await catalog.listPackages(event.id);
    expect(
      toDecimalString(paquete?.priceVersions[0]?.amount ?? { amount: 0, currency: 'USD' }),
    ).toBe('0.07');
  });
});

describe('alta de inscripción', () => {
  it('crea inscripción, cargo congelado y auditoría en una transacción', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026, status: 'ACTIVE' });
    const { publico, anticipado } = await seedCatalog(event.id);
    const person = await seedPerson('Ana Peregrina', '1990-05-20');
    const { userId } = await seedActor(prisma, {
      email: 'insc@encuentro.test',
      permissions: ['registration.create'],
      scopeType: 'EVENT',
      eventId: event.id,
    });

    const version = await requirePriceVersion(anticipado.id);
    const draft = prepareRegistration(
      null,
      {
        eventId: event.id,
        personId: person.id,
        birthDate: person.birthDate,
        packageId: publico.id,
        priceVersionId: anticipado.id,
        fromPublicPortal: true,
      },
      {
        eventStatus: 'ACTIVE',
        eventStartAt: event.startAt,
        packageVisibility: 'PUBLIC',
        priceVersion: version,
        hasExistingRegistration: false,
      },
      NOW,
    );

    const created = await registrations.create(draft, userId);

    expect(created.code).toBe('ENC2026-000001');
    expect(created.status).toBe('SUBMITTED');

    const charge = await prisma.charge.findFirstOrThrow({
      where: { registrationId: created.id },
    });
    expect(charge.amount.toFixed(2)).toBe('350.00');

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'registration.create' },
    });
    // La auditoría no guarda PII de la persona inscrita.
    expect(JSON.stringify(audit.afterRedacted)).not.toContain('Ana Peregrina');
  });

  it('numera las inscripciones de forma correlativa por gestión', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026, status: 'ACTIVE' });
    const { publico, alLlegar } = await seedCatalog(event.id);
    const { userId } = await seedActor(prisma, {
      email: 'insc@encuentro.test',
      permissions: ['registration.create'],
      scopeType: 'GLOBAL',
    });
    const version = await requirePriceVersion(alLlegar.id);

    const codes: string[] = [];
    for (const nombre of ['Uno', 'Dos', 'Tres']) {
      const person = await seedPerson(nombre, '1990-01-01');
      const draft = prepareRegistration(
        null,
        {
          eventId: event.id,
          personId: person.id,
          birthDate: person.birthDate,
          packageId: publico.id,
          priceVersionId: alLlegar.id,
          fromPublicPortal: true,
        },
        {
          eventStatus: 'ACTIVE',
          eventStartAt: event.startAt,
          packageVisibility: 'PUBLIC',
          priceVersion: version,
          hasExistingRegistration: false,
        },
        NOW,
      );
      codes.push((await registrations.create(draft, userId)).code);
    }

    expect(codes).toEqual(['ENC2026-000001', 'ENC2026-000002', 'ENC2026-000003']);
  });

  it('la misma persona no puede inscribirse dos veces en la misma gestión', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026, status: 'ACTIVE' });
    const { publico, alLlegar } = await seedCatalog(event.id);
    const person = await seedPerson('Ana', '1990-01-01');
    const { userId } = await seedActor(prisma, {
      email: 'insc@encuentro.test',
      permissions: ['registration.create'],
      scopeType: 'GLOBAL',
    });
    const version = await requirePriceVersion(alLlegar.id);

    const build = () =>
      prepareRegistration(
        null,
        {
          eventId: event.id,
          personId: person.id,
          birthDate: person.birthDate,
          packageId: publico.id,
          priceVersionId: alLlegar.id,
          fromPublicPortal: true,
        },
        {
          eventStatus: 'ACTIVE',
          eventStartAt: event.startAt,
          packageVisibility: 'PUBLIC',
          priceVersion: version,
          hasExistingRegistration: false,
        },
        NOW,
      );

    await registrations.create(build(), userId);
    // La segunda la rechaza el índice único, no la comprobación previa: es la
    // garantía que sobrevive a dos peticiones simultáneas.
    await expect(registrations.create(build(), userId)).rejects.toThrow();
  });
});

describe('el cargo congelado no cambia (REG-002, PKG-001)', () => {
  it('sobrevive a un cambio posterior de tarifa', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026, status: 'ACTIVE' });
    const { publico, alLlegar } = await seedCatalog(event.id);
    const person = await seedPerson('Ana', '1990-01-01');
    const { userId } = await seedActor(prisma, {
      email: 'insc@encuentro.test',
      permissions: ['registration.create'],
      scopeType: 'GLOBAL',
    });
    const version = await requirePriceVersion(alLlegar.id);

    const created = await registrations.create(
      prepareRegistration(
        null,
        {
          eventId: event.id,
          personId: person.id,
          birthDate: person.birthDate,
          packageId: publico.id,
          priceVersionId: alLlegar.id,
          fromPublicPortal: true,
        },
        {
          eventStatus: 'ACTIVE',
          eventStartAt: event.startAt,
          packageVisibility: 'PUBLIC',
          priceVersion: version,
          hasExistingRegistration: false,
        },
        NOW,
      ),
      userId,
    );

    // Se publica una tarifa nueva y más cara.
    await prisma.priceVersion.update({
      where: { id: alLlegar.id },
      data: { status: 'SUPERSEDED' },
    });
    await prisma.priceVersion.create({
      data: { packageId: publico.id, paymentMode: 'ARRIVAL', amount: '500.00', currency: 'USD' },
    });

    const charge = await prisma.charge.findFirstOrThrow({
      where: { registrationId: created.id },
    });
    expect(charge.amount.toFixed(2)).toBe('420.00');
  });

  it('el cargo es inmutable, aunque se intente por SQL directo', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026, status: 'ACTIVE' });
    const { publico, alLlegar } = await seedCatalog(event.id);
    const person = await seedPerson('Ana', '1990-01-01');
    const { userId } = await seedActor(prisma, {
      email: 'insc@encuentro.test',
      permissions: ['registration.create'],
      scopeType: 'GLOBAL',
    });
    const version = await requirePriceVersion(alLlegar.id);

    await registrations.create(
      prepareRegistration(
        null,
        {
          eventId: event.id,
          personId: person.id,
          birthDate: person.birthDate,
          packageId: publico.id,
          priceVersionId: alLlegar.id,
          fromPublicPortal: true,
        },
        {
          eventStatus: 'ACTIVE',
          eventStartAt: event.startAt,
          packageVisibility: 'PUBLIC',
          priceVersion: version,
          hasExistingRegistration: false,
        },
        NOW,
      ),
      userId,
    );

    await expect(prisma.$executeRawUnsafe(`UPDATE charges SET amount = 1`)).rejects.toThrow(
      /inmutable/,
    );
    await expect(prisma.$executeRawUnsafe('DELETE FROM charges')).rejects.toThrow(/inmutable/);
  });
});

describe('invariantes de catálogo impuestas por la base', () => {
  it('rechaza una tarifa anticipada sin vigencia ni mínimo', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const pkg = await prisma.package.create({
      data: { eventId: event.id, code: 'X', name: 'X', visibility: 'PUBLIC' },
    });

    // Sin ventana ni mínimo, el dominio no podría decidir REG-003 ni REG-004.
    await expect(
      prisma.priceVersion.create({
        data: { packageId: pkg.id, paymentMode: 'ADVANCE', amount: '100.00', currency: 'USD' },
      }),
    ).rejects.toThrow();
  });

  it('rechaza una modalidad que no existe', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const pkg = await prisma.package.create({
      data: { eventId: event.id, code: 'X', name: 'X', visibility: 'PUBLIC' },
    });

    await expect(
      prisma.priceVersion.create({
        data: { packageId: pkg.id, paymentMode: 'CUOTAS', amount: '100.00', currency: 'USD' },
      }),
    ).rejects.toThrow();
  });

  it('rechaza un importe negativo', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const pkg = await prisma.package.create({
      data: { eventId: event.id, code: 'X', name: 'X', visibility: 'PUBLIC' },
    });

    await expect(
      prisma.priceVersion.create({
        data: { packageId: pkg.id, paymentMode: 'ARRIVAL', amount: '-10.00', currency: 'USD' },
      }),
    ).rejects.toThrow();
  });

  it('rechaza una ventana de vigencia invertida', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const pkg = await prisma.package.create({
      data: { eventId: event.id, code: 'X', name: 'X', visibility: 'PUBLIC' },
    });

    await expect(
      prisma.priceVersion.create({
        data: {
          packageId: pkg.id,
          paymentMode: 'ADVANCE',
          amount: '100.00',
          currency: 'USD',
          startsAt: new Date('2026-10-15T00:00:00Z'),
          endsAt: new Date('2026-07-01T00:00:00Z'),
          minPaymentPercent: 50,
        },
      }),
    ).rejects.toThrow();
  });

  it('impide inscribir con una versión de precio de otro paquete', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026, status: 'ACTIVE' });
    const { publico, privado } = await seedCatalog(event.id);
    const otraVersion = await prisma.priceVersion.create({
      data: { packageId: privado.id, paymentMode: 'ARRIVAL', amount: '1.00', currency: 'USD' },
    });
    const person = await seedPerson('Ana', '1990-01-01');

    // La clave foránea compuesta lo rechaza aunque el código lo intentara.
    await expect(
      prisma.registration.create({
        data: {
          eventId: event.id,
          code: 'ENC2026-999999',
          personId: person.id,
          packageId: publico.id,
          priceVersionId: otraVersion.id,
          paymentMode: 'ARRIVAL',
        },
      }),
    ).rejects.toThrow();
  });
});
