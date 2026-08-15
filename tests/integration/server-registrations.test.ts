import type { PrismaClient } from '@encuentro/infrastructure';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, seedEvent, testPrisma } from './helpers';

/**
 * Gate del esquema de servidores — SRV-001, SRV-004, SRV-013, SRV-014, SRV-017.
 *
 * Todo lo que se prueba aquí lo garantiza **la base**: disparadores, índices
 * únicos parciales y restricciones. Ninguna se puede demostrar con dobles, y
 * ninguna debe depender de que el caso de uso se acuerde de comprobarla —
 * SRV-004 en particular cruza dos caminos distintos que no se ven entre sí.
 */
const prisma: PrismaClient = testPrisma();
const BOB = 'BOB';

interface Escenario {
  readonly eventId: string;
  readonly eventCode: string;
  readonly personId: string;
  readonly commissionId: string;
  readonly packageId: string;
  readonly priceVersionId: string;
  readonly autorId: string;
}

async function sembrar(): Promise<Escenario> {
  const event = await seedEvent(prisma, {
    code: `ENC-V${String(Math.floor(Math.random() * 100_000))}`,
    year: 2030 + Math.floor(Math.random() * 900),
    status: 'ACTIVE',
    currency: BOB,
  });

  const person = await prisma.person.create({
    data: { fullName: 'Persona Prueba', birthDate: new Date('1990-01-01') },
  });

  const commission = await prisma.commission.create({
    data: { eventId: event.id, code: 'COCINA', name: 'Cocina', area: 'Alimentación' },
  });

  const pkg = await prisma.package.create({
    data: { eventId: event.id, code: 'GENERAL', name: 'General', visibility: 'PUBLIC' },
  });

  const price = await prisma.priceVersion.create({
    data: { packageId: pkg.id, paymentMode: 'ARRIVAL', amount: '400.00', currency: BOB },
  });

  const autor = await prisma.user.create({
    data: { email: `coord-${event.code}@encuentro.invalid`, displayName: 'Coordinador' },
  });

  return {
    eventId: event.id,
    eventCode: event.code,
    personId: person.id,
    commissionId: commission.id,
    packageId: pkg.id,
    priceVersionId: price.id,
    autorId: autor.id,
  };
}

function inscripcionServidor(e: Escenario, overrides: Record<string, unknown> = {}) {
  return {
    eventId: e.eventId,
    code: `SRV-${e.eventCode}`,
    personId: e.personId,
    commissionId: e.commissionId,
    ...overrides,
  };
}

function inscripcionPeregrino(e: Escenario) {
  return {
    eventId: e.eventId,
    code: `REG-${e.eventCode}`,
    personId: e.personId,
    packageId: e.packageId,
    priceVersionId: e.priceVersionId,
    paymentMode: 'ARRIVAL',
    status: 'SUBMITTED',
  };
}

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('peregrino o servidor, nunca ambos — SRV-004', () => {
  /*
   * Los dos sentidos, porque son dos caminos distintos del producto y ninguno
   * ve al otro: el peregrino se inscribe solo, al servidor lo aprueba un
   * coordinador. Un disparador en una sola de las dos tablas dejaría abierta la
   * mitad del problema.
   *
   * Se comprueba que **rechaza**, no el texto del rechazo.
   *
   * El disparador lanza con `ERRCODE = unique_violation` y un mensaje que
   * nombra SRV-004, pero Prisma reconoce el código 23505 y lo sustituye por su
   * propio «Unique constraint failed»: el texto de la base no llega. Se elige
   * ese código igualmente porque es el que un caso de uso podrá distinguir para
   * traducirlo a un `DomainError` con un mensaje decente; el original queda en
   * el registro de Postgres para quien depure.
   */
  it('quien ya es servidor no puede inscribirse como peregrino', async () => {
    const e = await sembrar();
    await prisma.serverRegistration.create({ data: inscripcionServidor(e) });

    await expect(prisma.registration.create({ data: inscripcionPeregrino(e) })).rejects.toThrow();
  });

  it('quien ya es peregrino no puede apuntarse como servidor', async () => {
    const e = await sembrar();
    await prisma.registration.create({ data: inscripcionPeregrino(e) });

    await expect(
      prisma.serverRegistration.create({ data: inscripcionServidor(e) }),
    ).rejects.toThrow();
  });

  it('en otra gestión sí puede ser lo otro', async () => {
    const uno = await sembrar();
    await prisma.registration.create({ data: inscripcionPeregrino(uno) });

    // La misma persona, otra gestión: la restricción es por gestión.
    const otra = await seedEvent(prisma, {
      code: `ENC-W${String(Math.floor(Math.random() * 100_000))}`,
      year: 2900 + Math.floor(Math.random() * 90),
      status: 'ACTIVE',
      currency: BOB,
    });
    const comision = await prisma.commission.create({
      data: { eventId: otra.id, code: 'COCINA', name: 'Cocina', area: 'Alimentación' },
    });

    await expect(
      prisma.serverRegistration.create({
        data: {
          eventId: otra.id,
          code: `SRV-${otra.code}`,
          personId: uno.personId,
          commissionId: comision.id,
        },
      }),
    ).resolves.toBeDefined();
  });

  it('tampoco dos veces servidora en la misma gestión', async () => {
    const e = await sembrar();
    await prisma.serverRegistration.create({ data: inscripcionServidor(e) });

    await expect(
      prisma.serverRegistration.create({ data: inscripcionServidor(e, { code: 'SRV-OTRO' }) }),
    ).rejects.toThrow();
  });
});

describe('estados y motivo del rechazo — SRV-013, SRV-014', () => {
  it('rechaza un estado que no está en el contrato', async () => {
    const e = await sembrar();

    await expect(
      prisma.serverRegistration.create({ data: inscripcionServidor(e, { status: 'APROBADO' }) }),
    ).rejects.toThrow();
  });

  /*
   * Un rechazo sin motivo deja a la persona sin saber qué corregir. Lo impone
   * la base y no solo el caso de uso: es el dato que convierte un «no» en algo
   * accionable.
   */
  it('no se rechaza sin motivo', async () => {
    const e = await sembrar();

    await expect(
      prisma.serverRegistration.create({ data: inscripcionServidor(e, { status: 'REJECTED' }) }),
    ).rejects.toThrow();

    await expect(
      prisma.serverRegistration.create({
        data: inscripcionServidor(e, { status: 'REJECTED', rejectionReason: '   ' }),
      }),
    ).rejects.toThrow();
  });

  it('un motivo sobre una solicitud que no se rechazó tampoco se admite', async () => {
    const e = await sembrar();

    await expect(
      prisma.serverRegistration.create({
        data: inscripcionServidor(e, { status: 'ACTIVE', rejectionReason: 'sobra' }),
      }),
    ).rejects.toThrow();
  });
});

describe('asignación con vigencia — SRV-001', () => {
  async function conServidor(e: Escenario): Promise<string> {
    const fila = await prisma.serverRegistration.create({
      data: inscripcionServidor(e, { status: 'ACTIVE' }),
    });
    return fila.id;
  }

  /*
   * El criterio de SRV-001: «un cambio no altera el histórico anterior». Cambiar
   * de función cierra la asignación vigente y abre otra; la anterior se queda
   * para poder responder quién sirvió en qué.
   */
  it('cambiar de función conserva la asignación anterior', async () => {
    const e = await sembrar();
    const servidorId = await conServidor(e);

    const primera = await prisma.serverAssignment.create({
      data: {
        serverRegistrationId: servidorId,
        commissionId: e.commissionId,
        role: 'Cocina',
        schedule: 'Desayuno',
        validFrom: new Date('2026-11-01T00:00:00Z'),
        createdBy: e.autorId,
      },
    });

    await prisma.serverAssignment.update({
      where: { id: primera.id },
      data: { validUntil: new Date('2026-11-03T00:00:00Z') },
    });

    await prisma.serverAssignment.create({
      data: {
        serverRegistrationId: servidorId,
        commissionId: e.commissionId,
        role: 'Reparto',
        validFrom: new Date('2026-11-03T00:00:00Z'),
        createdBy: e.autorId,
      },
    });

    const historico = await prisma.serverAssignment.findMany({
      where: { serverRegistrationId: servidorId },
      orderBy: { validFrom: 'asc' },
      select: { role: true, validUntil: true },
    });

    expect(historico.map((a) => a.role)).toEqual(['Cocina', 'Reparto']);
    expect(historico[0]?.validUntil).not.toBeNull();
    expect(historico[1]?.validUntil).toBeNull();
  });

  /*
   * Sin el índice único parcial, olvidar cerrar la anterior dejaría a alguien
   * con dos funciones vigentes a la vez: la clase de dato que nadie mira hasta
   * el día del evento.
   */
  it('no puede haber dos asignaciones vigentes a la vez', async () => {
    const e = await sembrar();
    const servidorId = await conServidor(e);

    const comun = {
      serverRegistrationId: servidorId,
      commissionId: e.commissionId,
      validFrom: new Date('2026-11-01T00:00:00Z'),
      createdBy: e.autorId,
    };

    await prisma.serverAssignment.create({ data: { ...comun, role: 'Cocina' } });

    await expect(
      prisma.serverAssignment.create({ data: { ...comun, role: 'Reparto' } }),
    ).rejects.toThrow();
  });

  it('una vigencia que termina antes de empezar se rechaza', async () => {
    const e = await sembrar();
    const servidorId = await conServidor(e);

    await expect(
      prisma.serverAssignment.create({
        data: {
          serverRegistrationId: servidorId,
          commissionId: e.commissionId,
          role: 'Cocina',
          validFrom: new Date('2026-11-05T00:00:00Z'),
          validUntil: new Date('2026-11-01T00:00:00Z'),
          createdBy: e.autorId,
        },
      }),
    ).rejects.toThrow();
  });
});

describe('el cobro de servidor — SRV-017', () => {
  it('cero es gratuito y es lo que hay por omisión', async () => {
    const e = await sembrar();

    const config = await prisma.serverPaymentConfig.create({
      data: { eventId: e.eventId, currency: BOB },
    });

    expect(Number(config.amount)).toBe(0);
  });

  it('un importe negativo no se admite', async () => {
    const e = await sembrar();

    await expect(
      prisma.serverPaymentConfig.create({
        data: { eventId: e.eventId, amount: '-1.00', currency: BOB },
      }),
    ).rejects.toThrow();
  });

  it('solo hay una configuración por gestión', async () => {
    const e = await sembrar();
    await prisma.serverPaymentConfig.create({ data: { eventId: e.eventId, currency: BOB } });

    await expect(
      prisma.serverPaymentConfig.create({ data: { eventId: e.eventId, currency: BOB } }),
    ).rejects.toThrow();
  });
});

describe('el circuito de pago admite los dos dueños — SRV-020', () => {
  it('un cargo cuelga de una inscripción de servidor', async () => {
    const e = await sembrar();
    const servidor = await prisma.serverRegistration.create({
      data: inscripcionServidor(e, { status: 'AWAITING_PAYMENT' }),
    });

    const cargo = await prisma.charge.create({
      data: {
        serverRegistrationId: servidor.id,
        concept: 'SERVER_REGISTRATION',
        amount: '150.00',
        currency: BOB,
        snapshot: { origen: 'server_payment_config' },
      },
    });

    expect(cargo.registrationId).toBeNull();
  });

  /*
   * Exactamente uno. Un cargo sin dueño no lo reclama nadie, y uno con los dos
   * aparecería en el saldo de dos personas distintas.
   */
  it('un cargo sin dueño no se admite', async () => {
    await expect(
      prisma.charge.create({
        data: {
          concept: 'PACKAGE',
          amount: '150.00',
          currency: BOB,
          snapshot: {},
        },
      }),
    ).rejects.toThrow();
  });

  it('un cargo con los dos dueños tampoco', async () => {
    const e = await sembrar();
    const servidor = await prisma.serverRegistration.create({ data: inscripcionServidor(e) });

    // Otra persona, para poder tener una inscripción de peregrino en la misma
    // gestión sin chocar con SRV-004.
    const otra = await prisma.person.create({
      data: { fullName: 'Otra', birthDate: new Date('1990-01-01') },
    });
    const peregrino = await prisma.registration.create({
      data: { ...inscripcionPeregrino(e), personId: otra.id, code: `REG2-${e.eventCode}` },
    });

    await expect(
      prisma.charge.create({
        data: {
          registrationId: peregrino.id,
          serverRegistrationId: servidor.id,
          concept: 'PACKAGE',
          amount: '150.00',
          currency: BOB,
          snapshot: {},
        },
      }),
    ).rejects.toThrow();
  });
});

describe('la auditoría sabe de comisiones — SRV-023', () => {
  it('un registro puede llevar comisión', async () => {
    const e = await sembrar();

    const fila = await prisma.auditLog.create({
      data: {
        eventId: e.eventId,
        commissionId: e.commissionId,
        actorId: e.autorId,
        action: 'server.request.review',
        entity: 'server_registration',
        entityId: e.personId,
        afterRedacted: { status: 'ACTIVE' },
      },
    });

    expect(fila.commissionId).toBe(e.commissionId);
  });

  /*
   * La mayoría de las acciones no son de una comisión, y eso es lo correcto
   * para la regla: lo que no lleva comisión queda fuera del filtro del
   * encargado de área sin ninguna excepción escrita a mano.
   */
  it('sin comisión sigue siendo lo normal', async () => {
    const e = await sembrar();

    const fila = await prisma.auditLog.create({
      data: {
        eventId: e.eventId,
        actorId: e.autorId,
        action: 'payment.proof.approve',
        entity: 'payment_proof',
        entityId: e.personId,
        afterRedacted: {},
      },
    });

    expect(fila.commissionId).toBeNull();
  });

  /*
   * Una comisión pertenece a una gestión, así que un registro con comisión y
   * sin gestión describe algo que no existe.
   */
  it('una comisión sin gestión no se admite', async () => {
    const e = await sembrar();

    await expect(
      prisma.auditLog.create({
        data: {
          commissionId: e.commissionId,
          actorId: e.autorId,
          action: 'server.request.review',
          entity: 'server_registration',
          entityId: e.personId,
          afterRedacted: {},
        },
      }),
    ).rejects.toThrow();
  });
});
