import { defineConfig, devices } from '@playwright/test';

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

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',

  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },

  projects: VIEWPORTS.map((viewport) => ({
    name: viewport.name,
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: viewport.width, height: viewport.height },
    },
  })),

  webServer: {
    command: 'pnpm --filter @encuentro/web start --port 3100 --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
