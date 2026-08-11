import { expect, test as setup } from '@playwright/test';
import { readFileSync } from 'node:fs';

import { ACTORES, estado, type ClaveActor } from './actores';
import { sembrar } from './siembra';

/**
 * Preparación: siembra los actores y deja su sesión en disco.
 *
 * Es un proyecto de Playwright y no un `globalSetup` a propósito. Un
 * `globalSetup` es un módulo suelto: sin `expect`, sin traza, sin reintento, y
 * su fallo sale como excepción cruda antes de que exista informe. Como proyecto
 * sale en rojo con nombre, deja traza y se reintenta en CI — que es justo lo que
 * conviene a un enrolamiento TOTP con ventana de treinta segundos.
 */
setup.setTimeout(120_000);

setup('sembrar los actores del recorrido', async () => {
  const resultado = await sembrar();

  expect(resultado.correos).toHaveLength(Object.keys(ACTORES).length);

  /*
   * Se lee el fichero, no se comprueba la ruta.
   *
   * La versión anterior afirmaba `expect(estado(clave)).toBeTruthy()`, y eso
   * compara una cadena literal consigo misma: no puede fallar ni aunque la
   * siembra no hubiera escrito nada. Una afirmación que no puede fallar ocupa
   * el sitio de la que sí comprobaría algo, y aquí lo que hay que comprobar es
   * exactamente que la sesión llegó al disco con su cookie dentro.
   */
  for (const clave of Object.keys(ACTORES) as ClaveActor[]) {
    const guardado = JSON.parse(readFileSync(estado(clave), 'utf8')) as {
      cookies?: { name?: string; value?: string }[];
    };

    const sesion = guardado.cookies?.find((cookie) =>
      cookie.name?.endsWith('encuentro.session_token'),
    );

    expect(sesion, `${clave} no dejó cookie de sesión`).toBeDefined();
    expect(sesion?.value ?? '', `la cookie de ${clave} está vacía`).not.toBe('');
  }
});
