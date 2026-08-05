import 'server-only';

import {
  createActorResolver,
  createEventRepository,
  createPrismaClient,
} from '@encuentro/infrastructure';

/**
 * Raíz de composición del proceso web.
 *
 * `server-only` hace que el build falle si algo de esto acaba importado desde
 * un componente cliente. Sin esa marca, el error se manifestaría en ejecución
 * y con suerte en producción (regla 02-domain-boundaries: nada de Prisma en
 * React).
 *
 * El cliente se reutiliza entre peticiones porque en desarrollo Next recarga
 * los módulos y abriría un pool nuevo en cada cambio, agotando las conexiones
 * de Postgres.
 */
const globalForPrisma = globalThis as unknown as {
  encuentroPrisma?: ReturnType<typeof createPrismaClient>;
};

function prismaClient() {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error('Falta DATABASE_URL. Levante el entorno local con `pnpm db:up`.');
  }

  globalForPrisma.encuentroPrisma ??= createPrismaClient(url);
  return globalForPrisma.encuentroPrisma;
}

export function eventRepository() {
  return createEventRepository(prismaClient());
}

export function actorResolver() {
  return createActorResolver(prismaClient());
}

export function prisma() {
  return prismaClient();
}
