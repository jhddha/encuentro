import { expect, test } from '@playwright/test';

import { RUTAS_CONTRATO } from './rutas-contrato';

/**
 * Quién puede ver qué, sin sesión.
 *
 * Es la red que atrapa la clase entera de fallo «responde 200 a un anónimo».
 * Tres rutas del contrato —caja, comisión y escáner— estuvieron así hasta que
 * alguien las probó a mano; nada automatizado lo habría dicho.
 *
 * Sin navegador y sin datos: son peticiones HTTP contra el servidor. Por eso
 * puede recorrer las treinta y una en un par de segundos, y por eso no necesita
 * la siembra.
 */
test.describe('acceso anónimo a las rutas del contrato', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const ruta of RUTAS_CONTRATO) {
    test(`${ruta.plantilla} es ${ruta.acceso}`, async ({ request }) => {
      // Sin seguir la redirección: seguirla devolvería 200 desde `/ingresar` y
      // una pantalla guardada parecería una pantalla que se ve.
      const respuesta = await request.get(ruta.ruta, { maxRedirects: 0 });

      if (ruta.acceso === 'publica') {
        expect(respuesta.status(), `${ruta.plantilla} debería renderizar sin sesión`).toBe(200);
        return;
      }

      expect(respuesta.status(), `${ruta.plantilla} debería exigir sesión`).toBe(307);
      expect(respuesta.headers().location).toContain('/ingresar');
    });
  }
});
