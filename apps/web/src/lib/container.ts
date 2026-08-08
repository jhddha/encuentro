import 'server-only';

import {
  createActorResolver,
  createCatalogRepository,
  createEventRepository,
  createPaymentProofRepository,
  createPrismaClient,
  createRegistrationRepository,
  listProofsPendingReview,
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

export function catalogRepository() {
  return createCatalogRepository(prismaClient());
}

export function registrationRepository() {
  return createRegistrationRepository(prismaClient());
}

export function prisma() {
  return prismaClient();
}

/**
 * Bandeja de evidencias — solo lectura.
 *
 * No pasa por el puerto de la capa de aplicación a propósito: ese puerto existe
 * para el caso de uso que revisa, y esto es una consulta de pantalla. Es el
 * mismo trato que reciben `registrationRepository` y `catalogRepository`.
 */
export function proofsPendingReview(eventId: string) {
  return listProofsPendingReview(prismaClient(), eventId);
}

/**
 * Repositorio de revisión de evidencias.
 *
 * El secreto de verificación llega por entorno y **no se persiste**: es lo que
 * hace que un volcado de `receipts` no permita reconstruir los tokens de los QR
 * ya impresos.
 */
export function paymentProofRepository() {
  const secret = process.env.RECEIPT_VERIFICATION_SECRET;

  if (secret === undefined || secret === '') {
    throw new Error('Falta la variable de entorno RECEIPT_VERIFICATION_SECRET.');
  }

  return createPaymentProofRepository(prismaClient(), { verificationSecret: secret });
}
