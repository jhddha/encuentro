import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    /*
     * Las pruebas resuelven los paquetes del workspace a su código fuente, no a
     * `dist`. Contra `dist` bastaría olvidar un build para que una prueba pasara
     * sobre código viejo, o fallara por una razón que no es la real.
     */
    alias: {
      '@encuentro/domain': src('domain'),
      '@encuentro/application': src('application'),
      '@encuentro/infrastructure': src('infrastructure'),
      '@encuentro/config': src('config'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
    },
  },
});
