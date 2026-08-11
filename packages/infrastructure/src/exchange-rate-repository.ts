import type { ExchangeRateRecord, ExchangeRateRepository } from '@encuentro/application';
import type { ExchangeRate } from '@encuentro/domain';

import type { PrismaClient } from './prisma.js';

/**
 * Tasas de cambio contra la base — DEC-009.
 *
 * El día es una fecha civil y no un instante: la tasa es «la del 11 de agosto»,
 * no «la de las 15:42». La columna es `DATE` y aquí se construye a mediodía UTC
 * para que ninguna zona horaria la desplace al día anterior o al siguiente al
 * viajar — un desplazamiento de un día en una tasa es un cobro convertido con
 * el número equivocado.
 */

/** `YYYY-MM-DD` a la fecha que Postgres guardará como ese mismo día. */
function comoDiaCivil(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

/** Y de vuelta, sin que la zona del proceso intervenga. */
function comoTexto(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export function createExchangeRateRepository(prisma: PrismaClient): ExchangeRateRepository {
  return {
    async findForDay(eventId: string, currency: string, day: string): Promise<ExchangeRate | null> {
      const fila = await prisma.exchangeRate.findUnique({
        where: {
          eventId_currency_effectiveOn: {
            eventId,
            currency,
            effectiveOn: comoDiaCivil(day),
          },
        },
        select: { currency: true, rateMicros: true },
      });

      if (fila === null) return null;

      /*
       * `rateMicros` es BIGINT y Prisma lo entrega como `bigint`. El dominio
       * trabaja con `number` porque una cotización cabe de sobra en un entero
       * seguro; la conversión se hace aquí, en la frontera, y no dejando que un
       * `bigint` se cuele en el cálculo.
       */
      return { currency: fila.currency, rateMicros: Number(fila.rateMicros) };
    },

    async listRecent(eventId: string, limit: number): Promise<readonly ExchangeRateRecord[]> {
      const filas = await prisma.exchangeRate.findMany({
        where: { eventId },
        orderBy: [{ effectiveOn: 'desc' }, { currency: 'asc' }],
        take: limit,
        select: {
          currency: true,
          rateMicros: true,
          effectiveOn: true,
          createdAt: true,
          actor: { select: { email: true } },
        },
      });

      return filas.map((fila) => ({
        currency: fila.currency,
        rateMicros: Number(fila.rateMicros),
        effectiveOn: comoTexto(fila.effectiveOn),
        registeredBy: fila.actor.email,
        registeredAt: fila.createdAt,
      }));
    },

    async save(input): Promise<void> {
      const effectiveOn = comoDiaCivil(input.effectiveOn);

      await prisma.exchangeRate.upsert({
        where: {
          eventId_currency_effectiveOn: {
            eventId: input.eventId,
            currency: input.currency,
            effectiveOn,
          },
        },
        // Corregir la tasa del día es legítimo y no toca lo ya cobrado: el
        // comprobante congeló su copia. Queda quién la dejó como está.
        update: { rateMicros: BigInt(input.rateMicros), actorId: input.actorId },
        create: {
          eventId: input.eventId,
          currency: input.currency,
          rateMicros: BigInt(input.rateMicros),
          effectiveOn,
          actorId: input.actorId,
        },
      });
    },
  };
}
