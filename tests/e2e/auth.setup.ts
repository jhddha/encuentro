import { expect, test as setup } from '@playwright/test';

import { ACTORES, estado } from './actores';
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

  for (const clave of Object.keys(ACTORES) as (keyof typeof ACTORES)[]) {
    expect(estado(clave)).toBeTruthy();
  }
});
