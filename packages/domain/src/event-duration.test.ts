import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import { dayNumber, totalDays } from './event-duration.js';

const utc = (iso: string) => new Date(iso);

describe('duración configurable (EVT-007, EVT-008)', () => {
  it('calcula los 8 días de la referencia actual', () => {
    expect(totalDays(utc('2026-11-01T00:00:00Z'), utc('2026-11-08T23:59:59Z'))).toBe(8);
  });

  it('funciona con duraciones distintas de 8 — nada está fijado en código', () => {
    // Escenario obligatorio 8 de execution-plan.md §5.
    expect(totalDays(utc('2026-11-01T00:00:00Z'), utc('2026-11-05T00:00:00Z'))).toBe(5);
    expect(totalDays(utc('2026-11-01T00:00:00Z'), utc('2026-11-12T00:00:00Z'))).toBe(12);
    expect(totalDays(utc('2026-11-01T00:00:00Z'), utc('2026-11-30T00:00:00Z'))).toBe(30);
  });

  it('una gestión de un solo día dura 1, no 0', () => {
    expect(totalDays(utc('2026-11-01T08:00:00Z'), utc('2026-11-01T20:00:00Z'))).toBe(1);
  });

  it('cuenta días naturales, no bloques de 24 horas', () => {
    // De las 18:00 del día 1 a las 09:00 del día 2 son 15 horas, pero abarca
    // dos días naturales.
    expect(totalDays(utc('2026-11-01T18:00:00Z'), utc('2026-11-02T09:00:00Z'))).toBe(2);
  });

  it('cruza fin de mes y fin de año', () => {
    expect(totalDays(utc('2026-10-30T00:00:00Z'), utc('2026-11-02T00:00:00Z'))).toBe(4);
    expect(totalDays(utc('2026-12-30T00:00:00Z'), utc('2027-01-02T00:00:00Z'))).toBe(4);
  });

  it('incluye el 29 de febrero en año bisiesto', () => {
    expect(totalDays(utc('2028-02-28T00:00:00Z'), utc('2028-03-01T00:00:00Z'))).toBe(3);
  });

  it('rechaza un rango invertido', () => {
    expect(() => totalDays(utc('2026-11-08T00:00:00Z'), utc('2026-11-01T00:00:00Z'))).toThrow(
      DomainError,
    );
  });

  it('rechaza fechas inválidas', () => {
    expect(() => totalDays(new Date('no-es-fecha'), utc('2026-11-01T00:00:00Z'))).toThrow(
      DomainError,
    );
  });
});

describe('número de día dentro de la gestión', () => {
  const start = utc('2026-11-01T00:00:00Z');
  const end = utc('2026-11-08T23:59:59Z');

  it('el día de inicio es el día 1', () => {
    expect(dayNumber(start, end, utc('2026-11-01T09:00:00Z'))).toBe(1);
  });

  it('identifica los días 3 y final, los del escenario de IN_PROGRESS', () => {
    // REG-006 y DEC-004: los tres cobran el paquete completo. Este número solo
    // sirve para mostrar «día 3 de 8», nunca para calcular importe.
    expect(dayNumber(start, end, utc('2026-11-03T14:00:00Z'))).toBe(3);
    expect(dayNumber(start, end, utc('2026-11-08T22:00:00Z'))).toBe(8);
  });

  it('devuelve null fuera del rango, en vez de un número engañoso', () => {
    expect(dayNumber(start, end, utc('2026-10-31T23:00:00Z'))).toBeNull();
    expect(dayNumber(start, end, utc('2026-11-09T00:00:00Z'))).toBeNull();
  });

  it('el último día devuelve exactamente el total', () => {
    const total = totalDays(start, end);
    expect(dayNumber(start, end, end)).toBe(total);
  });
});
