import { expect, test } from '@playwright/test';

import { EVENTO } from './actores';

/**
 * Defectos que ya sabemos que están, escritos como la prueba que los cazará.
 *
 * Van en `test.fail()`: hoy fallan, y Playwright las da por buenas mientras
 * fallen. **El día que alguien arregle el defecto, esta prueba se pone roja** y
 * hay que venir aquí a quitarle el `fail`. Es lo contrario de un `skip`, que se
 * olvida solo.
 *
 * Arreglarlos es un cambio de aplicación, no de pruebas, y no entra en la misma
 * entrega que el andamiaje.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('oráculo de existencia de gestiones', () => {
  /*
   * `mi-cuenta/page.tsx` busca la gestión ANTES de exigir sesión, así que un
   * anónimo distingue una gestión que existe de una que no: la primera redirige
   * a `/ingresar` y la segunda responde 200 con «No existe la gestión». Enumerar
   * gestiones no es grave por sí solo, pero es una comprobación de acceso que
   * ocurre después de una consulta a la base, y ese orden se copia.
   *
   * Arreglo: mover `requireActor()` por delante de `findByCode`.
   */
  test.fail();

  test('una gestión inexistente no debe distinguirse de una existente', async ({ request }) => {
    const respuesta = await request.get(`/e/NOEXISTE/mi-cuenta`, { maxRedirects: 0 });

    expect(respuesta.status()).toBe(307);
    expect(respuesta.headers().location).toContain('/ingresar');
  });
});

test.describe('pantallas pendientes del peregrino', () => {
  /*
   * Credencial y notificaciones son `PendingScreen` sin guardián: responden 200
   * a cualquiera. Hoy no muestran nada, así que no filtran nada.
   *
   * La de la credencial es la que corre prisa: va a llevar un QR con token, y si
   * nace sin guardián el token nace público.
   *
   * **Hospedaje salió de esta lista el 14 de agosto de 2026.** Dejó de ser un
   * cascarón y ahora resuelve la inscripción por el usuario de la sesión, así
   * que exige sesión de verdad; su comprobación vive con las demás rutas
   * guardadas en `acceso-anonimo.spec.ts`. Mantenerla aquí habría hecho fallar
   * la suite por pasar, que es exactamente para lo que sirve `test.fail()`.
   */
  test.fail();

  for (const pantalla of ['credencial', 'notificaciones']) {
    test(`mi-cuenta/${pantalla} debe exigir sesión`, async ({ request }) => {
      const respuesta = await request.get(`/e/${EVENTO}/mi-cuenta/${pantalla}`, {
        maxRedirects: 0,
      });

      expect(respuesta.status()).toBe(307);
      expect(respuesta.headers().location).toContain('/ingresar');
    });
  }
});
