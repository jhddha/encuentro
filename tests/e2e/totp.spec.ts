import { expect, test } from '@playwright/test';

import { base32Decode, totp } from './totp';

/**
 * El generador de códigos, contra los vectores de la RFC 6238.
 *
 * Se comprueba contra el estándar y no contra la librería que usa el servidor.
 * Compararlo con `auth.api.generateTOTP` demostraría que las dos
 * implementaciones coinciden, no que alguna sea correcta; y si el día de mañana
 * el servidor cambia de librería, la única forma de saber quién se movió es
 * tener un ancla fuera de las dos.
 *
 * Los vectores del apéndice B son de ocho dígitos y aquí se generan seis, así
 * que se compara la cola: el truncado es el mismo y solo cambia el módulo.
 */

// Apéndice B: secreto ASCII «12345678901234567890» con HMAC-SHA1.
const SECRETO = Buffer.from('12345678901234567890');

const VECTORES = [
  { instante: 59, ocho: '94287082' },
  { instante: 1_111_111_109, ocho: '07081804' },
  { instante: 1_111_111_111, ocho: '14050471' },
  { instante: 1_234_567_890, ocho: '89005924' },
  { instante: 2_000_000_000, ocho: '69279037' },
  { instante: 20_000_000_000, ocho: '65353130' },
] as const;

test.describe('TOTP', () => {
  for (const vector of VECTORES) {
    test(`coincide con la RFC 6238 en t=${String(vector.instante)}`, () => {
      expect(totp(SECRETO, vector.instante * 1000)).toBe(vector.ocho.slice(-6));
    });
  }

  test('el código cambia con la ventana de treinta segundos', () => {
    // Alineado al inicio de una ventana: desde un instante cualquiera, «+29 s»
    // puede cruzar el borde y la prueba fallaría por su propio planteamiento.
    const inicioDeVentana = 56_666_667 * 30_000;

    expect(totp(SECRETO, inicioDeVentana)).toBe(totp(SECRETO, inicioDeVentana + 29_000));
    expect(totp(SECRETO, inicioDeVentana)).not.toBe(totp(SECRETO, inicioDeVentana + 31_000));
  });

  test('base32 sin relleno devuelve los bytes originales', () => {
    /*
     * En hexadecimal y no como texto: el secreto son **bytes**, y compararlos
     * como cadena los pasa por UTF-8, que sustituye lo que no sabe decodificar
     * y convierte un fallo real en una comparación de reemplazos.
     */
    expect(base32Decode('JBSWY3DPEHPK3PXP').toString('hex')).toBe('48656c6c6f21deadbeef');
    expect(base32Decode('MFRGGZDF').toString('hex')).toBe('6162636465');
  });
});
