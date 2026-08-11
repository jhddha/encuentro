import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import { convert } from './billing.js';
import { formatRate, parseRate, requireRate, type ExchangeRate } from './exchange-rate.js';

/**
 * Tasa de cambio — DEC-009.
 *
 * La conversión en sí la hace `convert` de `billing.ts` y ya tiene sus pruebas;
 * aquí se cubre lo que rodea al número: que no se pueda cobrar sin él, y que se
 * lea y se escriba como lo teclea una persona.
 */

/** 6,96 BOB por dólar, una cotización realista. */
const TASA: ExchangeRate = { currency: 'USD', rateMicros: 6_960_000 };

describe('exigir la tasa antes de cobrar', () => {
  it('devuelve la tasa cuando existe', () => {
    expect(requireRate(TASA, 'USD', '2026-08-11')).toBe(TASA);
  });

  it('el error nombra la moneda y el día', () => {
    // Quien lo lee es tesorería, que puede resolverlo. Un mensaje genérico la
    // manda a buscar un fallo de configuración que no existe.
    expect(() => requireRate(null, 'USD', '2026-08-11')).toThrow(/USD/);
    expect(() => requireRate(null, 'USD', '2026-08-11')).toThrow(/2026-08-11/);
  });
});

describe('leer y escribir la tasa', () => {
  it('acepta coma decimal', () => {
    // En Bolivia se escribe «6,96». Rechazarlo por el separador es hacerle
    // perder el tiempo a quien ya sabe el número.
    expect(parseRate('6,96', 'USD')).toEqual(parseRate('6.96', 'USD'));
    expect(parseRate('6,96', 'USD').rateMicros).toBe(6_960_000);
  });

  it('admite hasta seis decimales', () => {
    expect(parseRate('6.123456', 'USD').rateMicros).toBe(6_123_456);
    expect(() => parseRate('6.1234567', 'USD')).toThrow(DomainError);
  });

  it('rechaza el cero, lo negativo y lo que no es un número', () => {
    for (const malo of ['0', '0.000000', '-6.96', '', 'seis', '6.96 BOB']) {
      expect(() => parseRate(malo, 'USD'), malo).toThrow(DomainError);
    }
  });

  it('se escribe sin ceros de cola', () => {
    expect(formatRate(TASA, 'BOB')).toBe('1 USD = 6.96 BOB');
    expect(formatRate({ currency: 'USD', rateMicros: 7_000_000 }, 'BOB')).toBe('1 USD = 7 BOB');
  });

  it('lo escrito se puede volver a leer', () => {
    for (const texto of ['6.96', '13.5', '1.000001', '250']) {
      const tasa = parseRate(texto, 'USD');
      expect(parseRate(formatRate(tasa, 'BOB').split('= ')[1]?.split(' ')[0] ?? '', 'USD')).toEqual(
        tasa,
      );
    }
  });
});

describe('la conversión la hace billing, y encaja', () => {
  /*
   * No se reimplementa la aritmética: se comprueba que la tasa que produce
   * `parseRate` es la que `convert` espera. La primera versión de este módulo
   * duplicaba `convert` con otro nombre y nadie lo habría notado si los dos
   * exportaran constantes distintas.
   */
  it('lo que teclea una persona alimenta a convert', () => {
    const tasa = parseRate('6,96', 'USD');

    // 100.00 USD × 6,96 = 696.00 BOB
    expect(convert({ amount: 10_000, currency: 'USD' }, 'BOB', tasa.rateMicros)).toEqual({
      amount: 69_600,
      currency: 'BOB',
    });
  });

  it('el decimal no se degrada al pasar por coma flotante', () => {
    // `6.96 * 1_000_000` da 6959999.999999999. Construir las millonésimas desde
    // el texto lo evita, y esa diferencia acabaría impresa en un comprobante.
    expect(parseRate('6.96', 'USD').rateMicros).toBe(6_960_000);
    expect(Number.isSafeInteger(parseRate('6.96', 'USD').rateMicros)).toBe(true);
  });
});
