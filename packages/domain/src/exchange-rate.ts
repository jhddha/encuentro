import { RATE_SCALE } from './billing.js';
import { DomainError } from './errors.js';

/**
 * Tasa de cambio del día — DEC-009, cierra TBD-001.
 *
 * La aritmética de la conversión **no vive aquí**: es `convert` de `billing.ts`,
 * que ya trabaja en millonésimas y redondea al céntimo más cercano. Este módulo
 * cubre lo que faltaba alrededor: exigir que la tasa exista antes de cobrar, y
 * leerla y escribirla como la teclea una persona.
 *
 * La primera versión duplicaba `convert` con otro nombre. Lo delató el
 * compilador —dos `RATE_SCALE` exportados desde el mismo índice— y no una
 * prueba, que es la señal de lo cerca que estuvo de colarse.
 */

export interface ExchangeRate {
  /** Moneda extranjera de origen. La de destino es la de la gestión. */
  readonly currency: string;
  /** Millonésimas de la moneda funcional por unidad de esta. 6,96 → 6960000. */
  readonly rateMicros: number;
}

/**
 * Exige que exista tasa para poder cobrar en otra moneda.
 *
 * Se llama antes de aceptar la evidencia, no al aprobarla: DEC-009 congela la
 * tasa **al cargar**, así que si falta hay que decirlo antes de que el peregrino
 * crea que ya pagó.
 *
 * El mensaje nombra la moneda y el día porque quien lo lee es tesorería, que
 * puede resolverlo en un minuto — pero solo si sabe que lo que falta es eso y
 * no una configuración rota.
 */
export function requireRate(
  rate: ExchangeRate | null,
  currency: string,
  civilDay: string,
): ExchangeRate {
  if (rate === null) {
    throw new DomainError(
      'EXCHANGE_RATE_MISSING',
      `No hay tasa de cambio registrada para ${currency} el ${civilDay}. ` +
        'Regístrela en la configuración de la gestión antes de aceptar un cobro en esa moneda.',
    );
  }

  return rate;
}

/** Texto legible de una tasa, para la pantalla y para el comprobante. */
export function formatRate(rate: ExchangeRate, functionalCurrency: string): string {
  const entero = Math.trunc(rate.rateMicros / RATE_SCALE);
  const fraccion = rate.rateMicros % RATE_SCALE;

  // Seis decimales sin ceros de cola: 6,96 se lee «6.96», no «6.960000».
  const decimales = String(fraccion).padStart(6, '0').replace(/0+$/, '');

  return decimales === ''
    ? `1 ${rate.currency} = ${String(entero)} ${functionalCurrency}`
    : `1 ${rate.currency} = ${String(entero)}.${decimales} ${functionalCurrency}`;
}

/**
 * Interpreta lo que una persona escribe en el formulario.
 *
 * Acepta coma o punto: en Bolivia se escribe «6,96» y el teclado numérico de un
 * móvil produce lo que produce. Rechazar por el separador es hacerle perder el
 * tiempo a quien ya sabe el número.
 *
 * Se construyen las millonésimas desde el texto en vez de multiplicar por un
 * millón: `6.96 * 1_000_000` da 6959999.999999999 en coma flotante, y esa tasa
 * acabaría impresa en un comprobante.
 */
export function parseRate(texto: string, currency: string): ExchangeRate {
  const limpio = texto.trim().replace(',', '.');

  if (!/^\d+(\.\d{1,6})?$/.test(limpio)) {
    throw new DomainError(
      'MONEY_INVALID',
      'La tasa debe ser un número positivo con hasta seis decimales.',
    );
  }

  const [entero = '0', decimales = ''] = limpio.split('.');
  const micros = Number(entero) * RATE_SCALE + Number(decimales.padEnd(6, '0'));

  if (micros <= 0) {
    throw new DomainError('MONEY_INVALID', 'Una tasa de cambio tiene que ser mayor que cero.');
  }

  if (!Number.isSafeInteger(micros)) {
    throw new DomainError('MONEY_INVALID', 'La tasa es demasiado grande para ser una cotización.');
  }

  return { currency, rateMicros: micros };
}
