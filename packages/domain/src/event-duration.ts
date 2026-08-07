import { DomainError } from './errors.js';

/**
 * Duración de una gestión.
 *
 * EVT-016: `start_at` y `end_at` son configurables y la UI calcula el total de
 * días. EVT-016: la referencia actual son 8 días, **sin valor fijo en código**.
 *
 * De ahí que aquí no exista ninguna constante 8. El único número presente es el
 * 1 de «el día de inicio cuenta como día 1», que es la definición de contar
 * días inclusivos, no una duración.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Días naturales que abarca la gestión, contando inicio y fin.
 *
 * Se calcula sobre días UTC, no sobre la diferencia de milisegundos: un evento
 * que empieza a las 18:00 y termina a las 09:00 cinco días después abarca seis
 * días naturales, aunque la resta dé menos de 5×24 horas.
 *
 * Las fechas se guardan en UTC y se presentan en `events.timezone`
 * (requirements.md §10); el desfase de presentación no cambia este cálculo.
 */
export function totalDays(startAt: Date, endAt: Date): number {
  assertValidRange(startAt, endAt);

  const startDay = Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate());
  const endDay = Date.UTC(endAt.getUTCFullYear(), endAt.getUTCMonth(), endAt.getUTCDate());

  return Math.round((endDay - startDay) / MS_PER_DAY) + 1;
}

/**
 * Número de día dentro de la gestión, empezando en 1.
 *
 * Sirve para mostrar «día 3 de 8», nunca para calcular precio: REG-023 prohíbe
 * prorratear y DEC-004 fija que durante `IN_PROGRESS` se cobra el paquete
 * completo, sea cual sea el día de llegada.
 *
 * Devuelve `null` fuera del rango, en vez de un número negativo o mayor al
 * total, para que quien lo use tenga que decidir qué mostrar.
 */
export function dayNumber(startAt: Date, endAt: Date, moment: Date): number | null {
  assertValidRange(startAt, endAt);

  const startDay = Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate());
  const momentDay = Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), moment.getUTCDate());

  const offset = Math.round((momentDay - startDay) / MS_PER_DAY) + 1;

  return offset >= 1 && offset <= totalDays(startAt, endAt) ? offset : null;
}

function assertValidRange(startAt: Date, endAt: Date): void {
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new DomainError('EVENT_DATES_INVALID', 'Las fechas de la gestión no son válidas.');
  }

  if (endAt.getTime() < startAt.getTime()) {
    throw new DomainError(
      'EVENT_DATES_INVALID',
      'La fecha de fin no puede ser anterior a la de inicio.',
    );
  }
}
