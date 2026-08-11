import { defineConfig, devices } from '@playwright/test';
import { config as loadEnvFile } from 'dotenv';

import { estado, urlBaseDeDatos } from './tests/e2e/actores';

/*
 * El `.env` vive en la raíz y Playwright no lo carga solo. Sin esto,
 * `urlBaseDeDatos()` no encuentra `DATABASE_URL` y la configuración ni siquiera
 * llega a cargarse, con un error que no menciona a Playwright por ningún lado.
 */
loadEnvFile({ quiet: true });

/*
 * El identificador de la corrida se fija **aquí**, en el proceso principal, y
 * viaja a los workers por el entorno.
 *
 * Playwright ejecuta cada fichero en un proceso aparte. Calculado dentro de
 * `actores.ts` con la hora, cada worker obtenía uno distinto: la siembra creaba
 * `e2e-peregrino-<A>@…`, las pruebas buscaban `<B>` y la limpieza no encontraba
 * nada que borrar. Todo en verde y ni una cuenta retirada.
 */
process.env.E2E_RUN_ID ??= Date.now().toString(36);

/**
 * Viewports obligatorios: 390, 768, 1280, 1440 y 1920
 * (`docs/03-design/design-system.md` §4 y regla 05-ui-accessibility).
 *
 * Cada uno es un proyecto propio para que un fallo indique de inmediato en qué
 * tamaño ocurrió, en vez de esconderlo dentro de un único test parametrizado.
 */
const VIEWPORTS = [
  { name: 'movil-390', width: 390, height: 844 },
  { name: 'tableta-768', width: 768, height: 1024 },
  { name: 'laptop-1280', width: 1280, height: 800 },
  { name: 'escritorio-1440', width: 1440, height: 900 },
  { name: 'escritorio-1920', width: 1920, height: 1080 },
] as const;

const BASE_URL = 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },

  projects: [
    /*
     * La siembra es un proyecto y no un `globalSetup`: así sale en el informe
     * con nombre propio, deja traza y se reintenta en CI. Un enrolamiento TOTP
     * con ventana de treinta segundos merece ese reintento.
     */
    { name: 'preparacion', testMatch: /auth\.setup\.ts/, teardown: 'limpieza' },
    { name: 'limpieza', testMatch: /auth\.teardown\.ts/ },

    /*
     * Accesibilidad: cinco viewports, sin sesión. Es la única prueba de que lo
     * público se ve sin cuenta, así que se deja anónima.
     *
     * Pero **sí depende de la siembra**. Dos de sus rutas —la gestión y el
     * comparador de modalidad— necesitan que ENC2026 exista; sin ella, treinta
     * de estas pruebas auditaban la pantalla «no existe la gestión» y pasaban
     * igual. Verde sobre un vacío: exactamente la clase de prueba que ocupa el
     * sitio de la que sí demostraría algo.
     */
    ...VIEWPORTS.map((viewport) => ({
      name: viewport.name,
      dependencies: ['preparacion'],
      testMatch: /accessibility\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: viewport.width, height: viewport.height },
      },
    })),

    /*
     * Todo lo demás en un solo proyecto a 1280, y el personaje se elige **por
     * fichero** con `test.use({ storageState })`. Repetir «quién entra» en cinco
     * anchos multiplica el tiempo sin añadir señal: de las afirmaciones
     * autenticadas, ninguna depende del ancho.
     */
    {
      name: 'sesion-1280',
      dependencies: ['preparacion'],
      testIgnore: [/accessibility\.spec\.ts/, /auth\.(setup|teardown)\.ts/],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        storageState: estado('peregrino'),
      },
    },
  ],

  webServer: {
    command: 'pnpm --filter @encuentro/web start --port 3100 --hostname 127.0.0.1',
    url: BASE_URL,
    /*
     * `APP_URL` es imprescindible, no cosmético.
     *
     * Better Auth deriva de él sus orígenes de confianza. Con el valor del
     * `.env` —`http://localhost:3000`— un navegador que llega desde
     * `127.0.0.1:3100` recibe **403 INVALID_ORIGIN** al iniciar sesión: nadie
     * podía autenticarse contra este servidor, y el mensaje no lo dice.
     *
     * `NODE_ENV` decide además el nombre de la cookie de sesión, y la semilla
     * escribe el que corresponde a producción.
     */
    env: {
      APP_URL: BASE_URL,
      NODE_ENV: 'production',
      DATABASE_URL: urlBaseDeDatos(),
    },
    /*
     * Sin reutilizar: antes era `!CI`, y reutilizaba cualquier proceso vivo en
     * el 3100 —con otro build y otro `APP_URL`—, con lo que la sesión sembrada
     * dejaba de valer sin que nada lo dijera.
     */
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
