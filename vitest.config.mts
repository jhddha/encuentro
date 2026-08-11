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

      /*
       * `server-only` lanza al importarse fuera del servidor de Next, así que
       * cualquier módulo que lo lleve es imposible de probar. Se sustituye por
       * un módulo vacío en las pruebas.
       *
       * La alternativa habría sido quitar la marca de los módulos que se
       * quieren probar, y eso es peor: la marca existe para que el build falle
       * si algo del servidor acaba importado desde un componente cliente
       * (regla 02-domain-boundaries), y quitarla por comodidad de pruebas
       * apagaría justo esa garantía.
       */
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
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
