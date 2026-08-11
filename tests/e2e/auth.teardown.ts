import { test as teardown } from '@playwright/test';

import { limpiar } from './siembra';

/**
 * Limpieza: borra solo lo que sembró esta corrida.
 *
 * Por sufijo de correo, nunca por TRUNCATE. La base puede ser la misma que la
 * de desarrollo, y vaciarla se llevaría por delante el trabajo de quien esté
 * usándola.
 */
teardown.setTimeout(60_000);

teardown('borrar los actores del recorrido', async () => {
  const borrados = await limpiar();

  console.log(`Limpieza: ${String(borrados)} cuentas de prueba retiradas.`);
});
