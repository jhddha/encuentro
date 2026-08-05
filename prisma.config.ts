import 'dotenv/config';

import { defineConfig, env } from 'prisma/config';

/**
 * Configuración de Prisma 7.
 *
 * La URL de conexión ya no vive en `schema.prisma`: la lee Migrate desde aquí.
 * Prisma 7 tampoco carga `.env` por su cuenta, de ahí el `dotenv/config`.
 *
 * No se valida con `@encuentro/config` porque la CLI de Prisma carga este
 * archivo antes de que exista el build del workspace.
 */
interface PrismaEnv {
  DATABASE_URL: string;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env<PrismaEnv>('DATABASE_URL'),
  },
});
