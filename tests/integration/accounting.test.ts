import type { PrismaClient } from '@encuentro/infrastructure';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, seedActor, seedEvent, testPrisma } from './helpers';

/**
 * Gate de P12–P13: cuadre obligatorio, reversión en vez de edición, y SMTP
 * como singleton global.
 *
 * Recordatorio de procedencia: salvo la partida doble, GOV-007 y GOV-008, todo
 * lo que se prueba aquí procede de inferencia. Ver
 * `docs/implementation/12-accounting-notifications.md`.
 */
const prisma: PrismaClient = testPrisma();

async function seedLedger() {
  const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026, status: 'ACTIVE' });
  const { userId } = await seedActor(prisma, {
    email: `cont-${Math.random().toString(36).slice(2, 8)}@encuentro.test`,
    permissions: ['accounting.manage'],
    scopeType: 'GLOBAL',
  });

  const caja = await prisma.account_.create({
    data: { eventId: event.id, code: '1010', name: 'Caja', kind: 'ASSET', currency: 'USD' },
  });
  const ingresos = await prisma.account_.create({
    data: {
      eventId: event.id,
      code: '4010',
      name: 'Ingresos por inscripción',
      kind: 'INCOME',
      currency: 'USD',
    },
  });

  return { event, userId, caja, ingresos };
}

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

describe('partida doble impuesta por la base', () => {
  it('acepta un asiento cuadrado', async () => {
    const ctx = await seedLedger();

    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.journalEntry.create({
        data: {
          eventId: ctx.event.id,
          entryDate: new Date('2026-11-03'),
          memo: 'Cobro de inscripción',
          currency: 'USD',
          actorId: ctx.userId,
        },
      });

      await tx.journalLine.createMany({
        data: [
          {
            entryId: created.id,
            accountId: ctx.caja.id,
            side: 'DEBIT',
            amount: '350.00',
            currency: 'USD',
          },
          {
            entryId: created.id,
            accountId: ctx.ingresos.id,
            side: 'CREDIT',
            amount: '350.00',
            currency: 'USD',
          },
        ],
      });

      return created;
    });

    expect(await prisma.journalLine.count({ where: { entryId: entry.id } })).toBe(2);
  });

  it('rechaza un asiento descuadrado al hacer commit', async () => {
    const ctx = await seedLedger();

    // El constraint es DEFERRABLE: las líneas se insertan una a una y el cuadre
    // se comprueba al cerrar la transacción, no en cada INSERT.
    await expect(
      prisma.$transaction(async (tx) => {
        const created = await tx.journalEntry.create({
          data: {
            eventId: ctx.event.id,
            entryDate: new Date('2026-11-03'),
            memo: 'Asiento mal cuadrado',
            currency: 'USD',
            actorId: ctx.userId,
          },
        });

        await tx.journalLine.createMany({
          data: [
            {
              entryId: created.id,
              accountId: ctx.caja.id,
              side: 'DEBIT',
              amount: '350.00',
              currency: 'USD',
            },
            {
              entryId: created.id,
              accountId: ctx.ingresos.id,
              side: 'CREDIT',
              amount: '349.99',
              currency: 'USD',
            },
          ],
        });

        return created;
      }),
    ).rejects.toThrow(/no cuadra/);
  });

  it('rechaza un asiento de una sola línea', async () => {
    const ctx = await seedLedger();

    await expect(
      prisma.$transaction(async (tx) => {
        const created = await tx.journalEntry.create({
          data: {
            eventId: ctx.event.id,
            entryDate: new Date('2026-11-03'),
            memo: 'Media entrada',
            currency: 'USD',
            actorId: ctx.userId,
          },
        });

        await tx.journalLine.create({
          data: {
            entryId: created.id,
            accountId: ctx.caja.id,
            side: 'DEBIT',
            amount: '100.00',
            currency: 'USD',
          },
        });

        return created;
      }),
    ).rejects.toThrow(/dos lineas|dos líneas/);
  });

  it('rechaza un importe negativo en una línea', async () => {
    const ctx = await seedLedger();

    await expect(
      prisma.$transaction(async (tx) => {
        const created = await tx.journalEntry.create({
          data: {
            eventId: ctx.event.id,
            entryDate: new Date('2026-11-03'),
            memo: 'Negativo',
            currency: 'USD',
            actorId: ctx.userId,
          },
        });
        await tx.journalLine.create({
          data: {
            entryId: created.id,
            accountId: ctx.caja.id,
            side: 'DEBIT',
            amount: '-100.00',
            currency: 'USD',
          },
        });
        return created;
      }),
    ).rejects.toThrow();
  });
});

describe('la contabilidad no se reescribe (GOV-005)', () => {
  async function seedEntry() {
    const ctx = await seedLedger();
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.journalEntry.create({
        data: {
          eventId: ctx.event.id,
          entryDate: new Date('2026-11-03'),
          memo: 'Cobro',
          currency: 'USD',
          actorId: ctx.userId,
        },
      });
      await tx.journalLine.createMany({
        data: [
          {
            entryId: created.id,
            accountId: ctx.caja.id,
            side: 'DEBIT',
            amount: '100.00',
            currency: 'USD',
          },
          {
            entryId: created.id,
            accountId: ctx.ingresos.id,
            side: 'CREDIT',
            amount: '100.00',
            currency: 'USD',
          },
        ],
      });
      return created;
    });
    return { ctx, entry };
  }

  it('un asiento no se puede modificar ni borrar', async () => {
    await seedEntry();

    await expect(
      prisma.$executeRawUnsafe(`UPDATE journal_entries SET memo = 'alterado'`),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe('DELETE FROM journal_entries')).rejects.toThrow(
      /append-only/,
    );
  });

  it('la corrección se hace con un asiento de reversión', async () => {
    const { ctx } = await seedEntry();

    // El asiento inverso deja ambos en el histórico y el saldo neto en cero.
    await prisma.$transaction(async (tx) => {
      const reversal = await tx.journalEntry.create({
        data: {
          eventId: ctx.event.id,
          entryDate: new Date('2026-11-04'),
          memo: 'Reversión del cobro por error de captura',
          currency: 'USD',
          actorId: ctx.userId,
        },
      });
      await tx.journalLine.createMany({
        data: [
          {
            entryId: reversal.id,
            accountId: ctx.caja.id,
            side: 'CREDIT',
            amount: '100.00',
            currency: 'USD',
          },
          {
            entryId: reversal.id,
            accountId: ctx.ingresos.id,
            side: 'DEBIT',
            amount: '100.00',
            currency: 'USD',
          },
        ],
      });
    });

    expect(await prisma.journalEntry.count()).toBe(2);
  });
});

describe('SMTP es un singleton global (GOV-007)', () => {
  it('solo admite una configuración', async () => {
    await prisma.smtpSettings.create({
      data: {
        host: 'smtp.ejemplo.test',
        port: 587,
        fromName: 'Encuentro',
        fromEmail: 'no-reply@ejemplo.test',
      },
    });

    // La segunda choca con el índice único: la unicidad la garantiza la base,
    // no una comprobación en código.
    await expect(
      prisma.smtpSettings.create({
        data: {
          host: 'otro.ejemplo.test',
          port: 25,
          fromName: 'Otro',
          fromEmail: 'otro@ejemplo.test',
        },
      }),
    ).rejects.toThrow();
  });

  it('rechaza un puerto fuera de rango', async () => {
    await expect(
      prisma.smtpSettings.create({
        data: {
          host: 'smtp.ejemplo.test',
          port: 99999,
          fromName: 'Encuentro',
          fromEmail: 'no-reply@ejemplo.test',
        },
      }),
    ).rejects.toThrow();
  });

  it('la plantilla no lleva event_id — es global', async () => {
    const template = await prisma.notificationTemplate.create({
      data: {
        code: 'PAYMENT_APPROVED',
        subject: 'Tu pago fue aprobado',
        body: 'Hola {{nombre}}, recibimos {{monto}}.',
      },
    });

    // GOV-007: no existe columna de gestión en la plantilla.
    expect(Object.keys(template)).not.toContain('eventId');
  });

  it('las plantillas se versionan por código', async () => {
    await prisma.notificationTemplate.create({
      data: { code: 'X', version: 1, subject: 'a', body: 'b' },
    });
    await prisma.notificationTemplate.create({
      data: { code: 'X', version: 2, subject: 'a2', body: 'b2' },
    });

    await expect(
      prisma.notificationTemplate.create({
        data: { code: 'X', version: 2, subject: 'dup', body: 'dup' },
      }),
    ).rejects.toThrow();
  });
});

describe('cola de envíos (ADR-007, GOV-008)', () => {
  it('un envío marcado como enviado necesita su fecha', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const template = await prisma.notificationTemplate.create({
      data: { code: 'T', subject: 's', body: 'b' },
    });

    await expect(
      prisma.notification.create({
        data: {
          eventId: event.id,
          templateId: template.id,
          toEmail: 'ana@ejemplo.test',
          variables: {},
          status: 'SENT',
        },
      }),
    ).rejects.toThrow();
  });

  it('un envío pendiente se encola sin tocar la operación de origen', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const template = await prisma.notificationTemplate.create({
      data: { code: 'T', subject: 's', body: 'b' },
    });

    // GOV-008: encolar es todo lo que ocurre en la petición. Si el SMTP está
    // caído, el negocio ya quedó confirmado.
    const notification = await prisma.notification.create({
      data: {
        eventId: event.id,
        templateId: template.id,
        toEmail: 'ana@ejemplo.test',
        variables: { nombre: 'Ana' },
      },
    });

    expect(notification.status).toBe('PENDING');
    expect(notification.attempts).toBe(0);
  });
});

/**
 * Inmutabilidad de las líneas — ACC-003, GOV-005, GOV-009.
 *
 * P12 protegió la cabecera y olvidó las líneas: `journal_entries` tenía sus
 * triggers y `journal_lines` ninguno. Su único guardián era el trigger diferido
 * de cuadre, que además se rendía al llegar a cero líneas, así que un asiento
 * contabilizado se podía **vaciar** — la cabecera sobrevivía intacta y el cuadre
 * se comprobaba sobre nada.
 */
describe('las líneas del asiento son inmutables', () => {
  async function asientoCuadrado() {
    const ctx = await seedLedger();

    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.journalEntry.create({
        data: {
          eventId: ctx.event.id,
          entryDate: new Date('2026-11-03'),
          memo: 'Cobro de inscripción',
          currency: 'USD',
          actorId: ctx.userId,
        },
      });

      await tx.journalLine.createMany({
        data: [
          {
            entryId: created.id,
            accountId: ctx.caja.id,
            side: 'DEBIT',
            amount: '350.00',
            currency: 'USD',
          },
          {
            entryId: created.id,
            accountId: ctx.ingresos.id,
            side: 'CREDIT',
            amount: '350.00',
            currency: 'USD',
          },
        ],
      });

      return created;
    });

    return { ctx, entryId: entry.id };
  }

  it('no se puede vaciar un asiento contabilizado', async () => {
    const { entryId } = await asientoCuadrado();

    await expect(prisma.journalLine.deleteMany({ where: { entryId } })).rejects.toThrow();

    expect(await prisma.journalLine.count({ where: { entryId } })).toBe(2);
  });

  it('no se puede borrar una sola línea', async () => {
    const { entryId } = await asientoCuadrado();
    const linea = await prisma.journalLine.findFirstOrThrow({ where: { entryId } });

    await expect(prisma.journalLine.delete({ where: { id: linea.id } })).rejects.toThrow();

    expect(await prisma.journalLine.count({ where: { entryId } })).toBe(2);
  });

  /*
   * Reescribir el importe de una línea descuadraría el asiento sin dejar rastro.
   * La corrección de un asiento contabilizado es una reversión enlazada
   * (ACC-003), no una edición.
   */
  it('no se puede reescribir el importe de una línea', async () => {
    const { entryId } = await asientoCuadrado();
    const linea = await prisma.journalLine.findFirstOrThrow({ where: { entryId } });

    await expect(
      prisma.journalLine.update({ where: { id: linea.id }, data: { amount: '1.00' } }),
    ).rejects.toThrow();

    const despues = await prisma.journalLine.findUniqueOrThrow({ where: { id: linea.id } });
    expect(despues.amount.toString()).toBe(linea.amount.toString());
  });

  /*
   * La salida por vacuidad del trigger de cuadre. Con los triggers de arriba ya
   * no es alcanzable por borrado, pero un asiento que nace con una sola línea
   * tampoco debe pasar: antes `line_count = 0` devolvía NULL y `< 2` sí
   * levantaba, así que el hueco era exactamente el cero.
   */
  it('un asiento no puede quedar con menos de dos líneas', async () => {
    const ctx = await seedLedger();

    await expect(
      prisma.$transaction(async (tx) => {
        const created = await tx.journalEntry.create({
          data: {
            eventId: ctx.event.id,
            entryDate: new Date('2026-11-03'),
            memo: 'Asiento a medias',
            currency: 'USD',
            actorId: ctx.userId,
          },
        });

        await tx.journalLine.create({
          data: {
            entryId: created.id,
            accountId: ctx.caja.id,
            side: 'DEBIT',
            amount: '350.00',
            currency: 'USD',
          },
        });
      }),
    ).rejects.toThrow();
  });
});
