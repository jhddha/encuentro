import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  add,
  compare,
  meetsMinimumPercent,
  money,
  subtract,
  sum,
  toDecimalString,
} from './money.js';

describe('dinero en decimal exacto (requirements.md §10)', () => {
  it('convierte texto decimal a unidades mínimas y vuelta', () => {
    expect(money('350.00', 'USD').amount).toBe(35000);
    expect(toDecimalString(money('350.00', 'USD'))).toBe('350.00');
    expect(toDecimalString(money('0.05', 'USD'))).toBe('0.05');
    expect(toDecimalString(money('1234.56', 'BOB'))).toBe('1234.56');
  });

  it('acepta un decimal y lo normaliza a dos', () => {
    expect(toDecimalString(money('10.5', 'USD'))).toBe('10.50');
  });

  it('acepta enteros sin parte decimal', () => {
    expect(toDecimalString(money('10', 'USD'))).toBe('10.00');
  });

  it('no acumula error de coma flotante al sumar', () => {
    // 0.10 + 0.20 en float da 0.30000000000000004. En enteros, no.
    const resultado = add(money('0.10', 'USD'), money('0.20', 'USD'));
    expect(toDecimalString(resultado)).toBe('0.30');
  });

  it('suma cien veces un céntimo y da exactamente un peso', () => {
    const centimos = Array.from({ length: 100 }, () => money('0.01', 'USD'));
    expect(toDecimalString(sum(centimos, 'USD'))).toBe('1.00');
  });

  it('rechaza importes con más de dos decimales', () => {
    expect(() => money('10.999', 'USD')).toThrow(DomainError);
  });

  it('rechaza texto que no es un decimal', () => {
    expect(() => money('diez', 'USD')).toThrow(DomainError);
    expect(() => money('10,50', 'USD')).toThrow(DomainError);
    expect(() => money('', 'USD')).toThrow(DomainError);
  });

  it('rechaza monedas que no son ISO 4217', () => {
    expect(() => money('10.00', 'usd')).toThrow(DomainError);
    expect(() => money('10.00', 'DOLAR')).toThrow(DomainError);
  });

  it('maneja importes negativos, que representan reversiones', () => {
    expect(toDecimalString(money('-25.50', 'USD'))).toBe('-25.50');
    expect(toDecimalString(subtract(money('10.00', 'USD'), money('30.00', 'USD')))).toBe('-20.00');
  });
});

describe('mezcla de monedas', () => {
  it('rechaza sumar monedas distintas', () => {
    // Sumar BOB y USD sin conversión explícita produce un estado de cuenta
    // incorrecto sin que nadie se entere.
    let thrown: unknown;
    try {
      add(money('10.00', 'USD'), money('10.00', 'BOB'));
    } catch (error) {
      thrown = error;
    }
    expect((thrown as DomainError).code).toBe('MONEY_CURRENCY_MISMATCH');
  });

  it('rechaza comparar monedas distintas', () => {
    expect(() => compare(money('10.00', 'USD'), money('10.00', 'BOB'))).toThrow(DomainError);
  });
});

describe('porcentaje mínimo sin dividir (REG-020)', () => {
  it('el 50% exacto cumple', () => {
    expect(meetsMinimumPercent(money('175.00', 'USD'), money('350.00', 'USD'), 50)).toBe(true);
  });

  it('un céntimo por debajo no cumple', () => {
    expect(meetsMinimumPercent(money('174.99', 'USD'), money('350.00', 'USD'), 50)).toBe(false);
  });

  it('funciona con totales impares, donde dividir redondearía mal', () => {
    // 50% de 33.33 es 16.665. Comparando con enteros y sin dividir, 16.67
    // cumple y 16.66 no, sin ambigüedad de redondeo.
    expect(meetsMinimumPercent(money('16.67', 'USD'), money('33.33', 'USD'), 50)).toBe(true);
    expect(meetsMinimumPercent(money('16.66', 'USD'), money('33.33', 'USD'), 50)).toBe(false);
  });

  it('admite umbrales distintos de 50, porque es configurable', () => {
    expect(meetsMinimumPercent(money('105.00', 'USD'), money('350.00', 'USD'), 30)).toBe(true);
    expect(meetsMinimumPercent(money('104.99', 'USD'), money('350.00', 'USD'), 30)).toBe(false);
  });

  it('rechaza porcentajes fuera de rango', () => {
    expect(() => meetsMinimumPercent(money('1.00', 'USD'), money('2.00', 'USD'), 150)).toThrow(
      DomainError,
    );
    expect(() => meetsMinimumPercent(money('1.00', 'USD'), money('2.00', 'USD'), 50.5)).toThrow(
      DomainError,
    );
  });
});
