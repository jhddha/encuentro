import { describe, expect, it } from 'vitest';

import { civilDayAnchor, civilDayIn, todayAnchorIn } from './civil-date.js';

/**
 * Días civiles — NFR-013.
 *
 * Estas pruebas existen por un fallo concreto: el tope del campo de fecha se
 * calculaba en la zona de la gestión y la validación comparaba contra el
 * instante UTC, así que a primera hora del día el formulario ofrecía una fecha
 * que la regla rechazaba.
 */

const LA_PAZ = 'America/La_Paz'; // UTC−4
const YAKARTA = 'Asia/Jakarta'; // UTC+7

describe('civilDayIn', () => {
  it('resuelve el día en la zona indicada, no en la del servidor', () => {
    // 02:00 UTC del 9 es todavía el 8 en La Paz y ya el 9 en Yakarta.
    const instante = new Date('2026-08-09T02:00:00.000Z');

    expect(civilDayIn(LA_PAZ, instante)).toBe('2026-08-08');
    expect(civilDayIn(YAKARTA, instante)).toBe('2026-08-09');
    expect(civilDayIn('UTC', instante)).toBe('2026-08-09');
  });

  it('rellena mes y día a dos cifras', () => {
    expect(civilDayIn('UTC', new Date('2026-01-05T12:00:00.000Z'))).toBe('2026-01-05');
  });
});

describe('civilDayAnchor', () => {
  it('ancla a mediodía UTC', () => {
    expect(civilDayAnchor('2026-08-08')?.toISOString()).toBe('2026-08-08T12:00:00.000Z');
  });

  /*
   * La razón de que sea mediodía y no medianoche: `new Date('2026-08-08')` es
   * medianoche UTC, que en La Paz es todavía el 7. Con el ancla de mediodía el
   * día se conserva a ambos lados.
   */
  it('el día anclado se lee igual al este y al oeste', () => {
    const anclado = civilDayAnchor('2026-08-08');
    expect(anclado).not.toBeNull();

    if (anclado !== null) {
      expect(civilDayIn(LA_PAZ, anclado)).toBe('2026-08-08');
      expect(civilDayIn(YAKARTA, anclado)).toBe('2026-08-08');
    }
  });

  it('comparar dos anclas compara días, no horas', () => {
    const ocho = civilDayAnchor('2026-08-08')?.getTime() ?? 0;
    const nueve = civilDayAnchor('2026-08-09')?.getTime() ?? 0;

    expect(nueve).toBeGreaterThan(ocho);
  });

  it('rechaza lo que no es un día', () => {
    expect(civilDayAnchor('')).toBeNull();
    expect(civilDayAnchor('08/08/2026')).toBeNull();
    expect(civilDayAnchor('2026-8-8')).toBeNull();
    expect(civilDayAnchor('2026-08-08T12:00:00Z')).toBeNull();
  });

  /*
   * `new Date('2026-02-31')` no falla: lo convierte al 3 de marzo. Aceptarlo
   * dejaría al peregrino declarando una fecha que él no escribió.
   */
  it('rechaza un día que no existe en vez de correrlo al mes siguiente', () => {
    expect(civilDayAnchor('2026-02-31')).toBeNull();
    expect(civilDayAnchor('2026-13-01')).toBeNull();
    expect(civilDayAnchor('2026-04-31')).toBeNull();
  });

  it('acepta el 29 de febrero de un año bisiesto', () => {
    expect(civilDayAnchor('2028-02-29')?.toISOString()).toBe('2028-02-29T12:00:00.000Z');
    expect(civilDayAnchor('2026-02-29')).toBeNull();
  });
});

describe('todayAnchorIn', () => {
  it('a primera hora en La Paz, hoy ya es el día siguiente al UTC de anoche', () => {
    // 06:30 en La Paz del día 8 = 10:30 UTC del día 8.
    const anclado = todayAnchorIn(LA_PAZ, new Date('2026-08-08T10:30:00.000Z'));
    expect(anclado.toISOString()).toBe('2026-08-08T12:00:00.000Z');
  });

  it('a última hora en Yakarta, hoy ya es el día siguiente al UTC', () => {
    // 00:30 del 9 en Yakarta = 17:30 UTC del 8.
    const anclado = todayAnchorIn(YAKARTA, new Date('2026-08-08T17:30:00.000Z'));
    expect(anclado.toISOString()).toBe('2026-08-09T12:00:00.000Z');
  });

  it('una zona inexistente es configuración rota, no dato de usuario', () => {
    expect(() => todayAnchorIn('Marte/Olympus', new Date())).toThrow();
  });
});
