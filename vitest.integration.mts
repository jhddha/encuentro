import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

/**
 * Pruebas de integración: corren contra el Postgres real de `docker-compose.yml`.
 *
 * Van en su propia configuración y no junto a las unitarias porque necesitan
 * infraestructura levantada. Mezclarlas haría que `pnpm test` fallara en
 * cualquier máquina sin Docker, y una suite que no se puede correr deja de
 * ejecutarse.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@encuentro/domain': src('domain'),
      '@encuentro/application': src('application'),
      '@encuentro/infrastructure': src('infrastructure'),
      '@encuentro/config': src('config'),
    },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./tests/integration/setup.ts'],
    // Las pruebas comparten una base: ejecutarlas en paralelo haría que la
    // limpieza de una borrara los datos de otra.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
