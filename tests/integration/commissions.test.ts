import { createActorResolver, type PrismaClient } from '@encuentro/infrastructure';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { requireActor, resetDatabase, seedActor, seedEvent, testPrisma } from './helpers';

/**
 * Comisiones como tabla — EVT-002, SRV-001, TRN-008, ACC-007, ACC-014.
 *
 * Hasta el 11 de agosto de 2026 `role_assignments.commission_id` era texto
 * libre: un permiso podía apuntar a una comisión inexistente y nada lo
 * impedía. Estas pruebas comprueban lo que solo la base puede demostrar — que
 * la integridad referencial existe de verdad y que el alcance sigue
 * funcionando con ella puesta.
 */
const prisma: PrismaClient = testPrisma();

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function sembrarComision(eventId: string, code = 'HOSPEDAJE') {
  return await prisma.commission.create({
    data: { eventId, code, name: 'Hospedaje', area: 'Atención al peregrino' },
  });
}

describe('la comisión es una fila, no una cadena', () => {
  it('rechaza una asignación que apunta a una comisión inexistente', async () => {
    const event = await seedEvent(prisma, { code: 'ENC26-C1', year: 2031, status: 'ACTIVE' });
    const inventada = '00000000-0000-4000-8000-0000000000ff';

    /*
     * Antes esto se guardaba sin protestar: el permiso quedaba concedido sobre
     * una comisión que no existe, y nadie se enteraba hasta que alguien
     * intentaba usarlo.
     */
    await expect(
      seedActor(prisma, {
        email: 'fantasma@ejemplo.test',
        permissions: ['registration.read'],
        scopeType: 'COMMISSION',
        eventId: event.id,
        commissionId: inventada,
      }),
    ).rejects.toThrow();
  });

  it('conserva el alcance cuando la comisión existe', async () => {
    const event = await seedEvent(prisma, { code: 'ENC26-C2', year: 2032, status: 'ACTIVE' });
    const comision = await sembrarComision(event.id);

    const sembrado = await seedActor(prisma, {
      email: 'coordinadora@ejemplo.test',
      permissions: ['registration.read'],
      scopeType: 'COMMISSION',
      eventId: event.id,
      commissionId: comision.id,
    });

    const actor = await requireActor(createActorResolver(prisma), sembrado.userId);

    expect(actor.assignments).toHaveLength(1);
    expect(actor.assignments[0]?.scope).toEqual({
      type: 'COMMISSION',
      eventId: event.id,
      commissionId: comision.id,
    });
  });

  /*
   * TRN-008: el coordinador solo ve su comisión. La regla vive en el dominio y
   * compara identificadores; lo que esto comprueba es que los identificadores
   * que llegan del repositorio son los correctos y no se cruzan.
   */
  it('dos comisiones de la misma gestión no se confunden', async () => {
    const event = await seedEvent(prisma, { code: 'ENC26-C3', year: 2033, status: 'ACTIVE' });
    const hospedaje = await sembrarComision(event.id, 'HOSPEDAJE');
    const transporte = await sembrarComision(event.id, 'TRANSPORTE');

    const sembrado = await seedActor(prisma, {
      email: 'hospedaje@ejemplo.test',
      permissions: ['registration.read'],
      scopeType: 'COMMISSION',
      eventId: event.id,
      commissionId: hospedaje.id,
    });

    const actor = await requireActor(createActorResolver(prisma), sembrado.userId);
    const alcance = actor.assignments[0]?.scope;

    expect(alcance).toEqual({
      type: 'COMMISSION',
      eventId: event.id,
      commissionId: hospedaje.id,
    });
    expect(alcance).not.toEqual({
      type: 'COMMISSION',
      eventId: event.id,
      commissionId: transporte.id,
    });
  });

  it('el código es único dentro de la gestión y libre fuera de ella', async () => {
    const primera = await seedEvent(prisma, { code: 'ENC26-C4', year: 2034, status: 'ACTIVE' });
    const segunda = await seedEvent(prisma, { code: 'ENC26-C5', year: 2035, status: 'ACTIVE' });

    await sembrarComision(primera.id, 'HOSPEDAJE');

    await expect(sembrarComision(primera.id, 'HOSPEDAJE')).rejects.toThrow();

    // La misma comisión en otra gestión es otra fila: un permiso de una edición
    // no alcanza a la siguiente, que es la razón de que sea por gestión.
    await expect(sembrarComision(segunda.id, 'HOSPEDAJE')).resolves.toBeDefined();
  });
});

describe('la comisión del asiento contable', () => {
  it('no puede ser de otra gestión', async () => {
    const propia = await seedEvent(prisma, { code: 'ENC26-C6', year: 2036, status: 'ACTIVE' });
    const ajena = await seedEvent(prisma, { code: 'ENC26-C7', year: 2037, status: 'ACTIVE' });
    const deLaAjena = await sembrarComision(ajena.id);

    const actor = await seedActor(prisma, {
      email: 'contable@ejemplo.test',
      permissions: ['audit.read'],
      scopeType: 'GLOBAL',
    });

    /*
     * EVT-008 en negativo: el riesgo de una gestión no es olvidar un dato, es
     * arrastrar sin darse cuenta uno del año anterior. La clave foránea sola no
     * bastaría —la comisión existe, solo que en otra gestión— y por eso hay
     * disparador.
     */
    await expect(
      prisma.journalEntry.create({
        data: {
          eventId: propia.id,
          entryDate: new Date('2026-11-02'),
          memo: 'asiento con comisión ajena',
          currency: 'BOB',
          actorId: actor.userId,
          commissionId: deLaAjena.id,
        },
      }),
    ).rejects.toThrow(/otra gestion/i);
  });

  it('admite un asiento sin comisión', async () => {
    const event = await seedEvent(prisma, { code: 'ENC26-C8', year: 2038, status: 'ACTIVE' });
    const actor = await seedActor(prisma, {
      email: 'contable2@ejemplo.test',
      permissions: ['audit.read'],
      scopeType: 'GLOBAL',
    });

    const caja = await prisma.account_.create({
      data: { eventId: event.id, code: '111010004', name: 'Caja', kind: 'ASSET', currency: 'BOB' },
    });
    const ofrenda = await prisma.account_.create({
      data: {
        eventId: event.id,
        code: '411010001',
        name: 'Ofrenda',
        kind: 'INCOME',
        currency: 'BOB',
      },
    });

    /*
     * Con sus líneas, y no por adorno: el asiento sin ninguna se rechaza al
     * confirmar (ACC-002), porque quedaría indestructible bloqueando su clave
     * de idempotencia. La primera versión de esta prueba lo descubrió.
     *
     * Un cobro de inscripción es de la gestión, no de una comisión: ACC-007
     * exige comisión al **egreso**, no a todo asiento.
     */
    const asiento = await prisma.journalEntry.create({
      data: {
        eventId: event.id,
        entryDate: new Date('2026-11-02'),
        memo: 'cobro de inscripción',
        currency: 'BOB',
        actorId: actor.userId,
        lines: {
          create: [
            { accountId: caja.id, side: 'DEBIT', amount: '420.00', currency: 'BOB' },
            { accountId: ofrenda.id, side: 'CREDIT', amount: '420.00', currency: 'BOB' },
          ],
        },
      },
    });

    expect(asiento.commissionId).toBeNull();
  });
});
