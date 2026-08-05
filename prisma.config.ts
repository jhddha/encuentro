import { defineConfig } from 'prisma/config';

/**
 * Configuración de Prisma 7.
 *
 * La URL de conexión ya no vive en `schema.prisma`; la lee Migrate desde aquí.
 * No se valida con `@encuentro/config` porque este archivo lo carga la CLI de
 * Prisma antes de que exista el build del workspace.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});
