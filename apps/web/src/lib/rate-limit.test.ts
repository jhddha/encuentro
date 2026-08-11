import { describe, expect, it } from 'vitest';

import { checkRateLimit, clientKey } from './rate-limit';

/**
 * Límite de ritmo de la verificación pública — PAY-031.
 *
 * El contador vive en `globalThis` para sobrevivir a las recargas de módulo de
 * Next, así que cada prueba usa una clave distinta en lugar de vaciarlo: vaciar
 * un estado compartido haría que el orden de las pruebas importara.
 */
let contador = 0;
const clave = () => `prueba-${String(++contador)}`;

const AHORA = 1_770_000_000_000;

describe('checkRateLimit', () => {
  it('deja pasar hasta el límite', () => {
    const k = clave();

    for (let i = 0; i < 30; i += 1) {
      expect(checkRateLimit(k, AHORA).allowed).toBe(true);
    }
  });

  it('corta a partir del límite', () => {
    const k = clave();

    for (let i = 0; i < 30; i += 1) checkRateLimit(k, AHORA);

    const cortada = checkRateLimit(k, AHORA);
    expect(cortada.allowed).toBe(false);
    expect(cortada.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('la ventana se reinicia sola', () => {
    const k = clave();

    for (let i = 0; i < 31; i += 1) checkRateLimit(k, AHORA);
    expect(checkRateLimit(k, AHORA).allowed).toBe(false);

    // Un minuto y un milisegundo después.
    expect(checkRateLimit(k, AHORA + 60_001).allowed).toBe(true);
  });

  /*
   * Lo que hace útil el límite: que un cliente abusivo no afecte al resto. Si
   * el contador fuera global en vez de por origen, el primero en pasarse
   * dejaría fuera a todos los demás.
   */
  it('cuenta por origen, no en total', () => {
    const abusivo = clave();
    const normal = clave();

    for (let i = 0; i < 40; i += 1) checkRateLimit(abusivo, AHORA);

    expect(checkRateLimit(abusivo, AHORA).allowed).toBe(false);
    expect(checkRateLimit(normal, AHORA).allowed).toBe(true);
  });

  it('el tiempo de espera nunca es cero cuando corta', () => {
    const k = clave();

    for (let i = 0; i < 31; i += 1) checkRateLimit(k, AHORA);

    // Un milisegundo antes de que la ventana venza: redondear hacia abajo daría
    // cero y el cliente reintentaría de inmediato en bucle.
    const casi = checkRateLimit(k, AHORA + 59_999);
    expect(casi.allowed).toBe(false);
    expect(casi.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe('clientKey', () => {
  it('prefiere x-real-ip, que la pone el proxy', () => {
    const h = new Headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '10.0.0.1' });
    expect(clientKey(h)).toBe('203.0.113.7');
  });

  it('de x-forwarded-for toma solo el primero, que es el cliente', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' });
    expect(clientKey(h)).toBe('203.0.113.7');
  });

  /*
   * Sin proxy —desarrollo local— todo cae bajo la misma clave. Es lo estricto:
   * no hay a quién distinguir, así que se cuenta junto en vez de dar a cada
   * petición su propia cuota.
   */
  it('sin cabeceras cuenta todo junto', () => {
    expect(clientKey(new Headers())).toBe('sin-origen');
    expect(clientKey(new Headers({ 'x-real-ip': '   ' }))).toBe('sin-origen');
  });
});
