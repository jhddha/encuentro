import 'server-only';

import type { EvidenceStore } from '@encuentro/application';
import { ADVANCE_CHANNELS } from '@encuentro/domain';
import {
  createActorResolver,
  createCatalogRepository,
  createEventRepository,
  createExchangeRateRepository,
  createLodgingRepository,
  createObjectStorage,
  createPaymentProofRepository,
  createPrismaClient,
  createProofSubmissionRepository,
  createRegistrationConfirmationRepository,
  createRegistrationRepository,
  findAccountStatement,
  findMyLodging,
  listAssignments,
  findProofDetail,
  listAdvanceChannels,
  listProofsPendingReview,
  listRegistrationsWithBalance,
  systemClock,
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

export function exchangeRateRepository() {
  return createExchangeRateRepository(prismaClient());
}

export function catalogRepository() {
  return createCatalogRepository(prismaClient());
}

export function registrationRepository() {
  return createRegistrationRepository(prismaClient());
}

export function registrationConfirmationRepository() {
  return createRegistrationConfirmationRepository(prismaClient());
}

/**
 * Bandeja de inscripciones con saldo y veredicto de REG-017 — solo lectura.
 *
 * En una pasada, no una consulta por fila: ver `listRegistrationsWithBalance`.
 */
export function registrationsWithBalance(eventId: string) {
  return listRegistrationsWithBalance(prismaClient(), eventId);
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

export function proofDetail(proofId: string) {
  return findProofDetail(prismaClient(), proofId);
}

/**
 * Repositorio de revisión de evidencias.
 *
 * El secreto de verificación llega por entorno y **no se persiste**: es lo que
 * hace que un volcado de `receipts` no permita reconstruir los tokens de los QR
 * ya impresos.
 */
/**
 * Almacén de evidencias.
 *
 * Los cuatro valores son obligatorios: sin ellos no hay dónde guardar un
 * comprobante, y fallar al arrancar es mejor que aceptar una subida que se
 * pierde.
 */
export function objectStorage() {
  return createObjectStorage({
    endpoint: requireEnv('OBJECT_STORAGE_ENDPOINT'),
    bucket: requireEnv('OBJECT_STORAGE_BUCKET'),
    accessKey: requireEnv('OBJECT_STORAGE_ACCESS_KEY'),
    secretKey: requireEnv('OBJECT_STORAGE_SECRET_KEY'),
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}

export function paymentProofRepository() {
  const secret = process.env.RECEIPT_VERIFICATION_SECRET;

  if (secret === undefined || secret === '') {
    throw new Error('Falta la variable de entorno RECEIPT_VERIFICATION_SECRET.');
  }

  return createPaymentProofRepository(prismaClient(), { verificationSecret: secret });
}

export function proofSubmissionRepository() {
  return createProofSubmissionRepository(prismaClient());
}

/**
 * Adaptador del almacén al puerto de la capa de aplicación.
 *
 * El caso de uso solo conoce `EvidenceStore`: guardar algo y recibir clave y
 * suma. Que detrás haya S3 —o MinIO en local— no le incumbe, y esta función es
 * el único punto donde ambas formas se tocan.
 */
export function evidenceStore(): EvidenceStore {
  const storage = objectStorage();
  return { store: (input) => storage.putEvidence(input) };
}

export function clock() {
  return systemClock;
}

/** Estado de cuenta del peregrino — solo lectura, como el resto de consultas de pantalla. */
export function accountStatement(eventId: string, userId: string) {
  return findAccountStatement(prismaClient(), eventId, userId);
}

/** PAY-023: los tres canales anticipados. Los de llegada son de caja (PAY-024). */
export function advanceChannels(eventId: string) {
  return listAdvanceChannels(prismaClient(), eventId, ADVANCE_CHANNELS);
}

/** Hospedaje — HOS-001, HOS-002, HOS-016. */
export function lodgingRepository() {
  return createLodgingRepository(prismaClient());
}

/** Hospedaje de la persona de la sesión. Nunca por identificador de la URL. */
export function myLodging(eventId: string, userId: string) {
  return findMyLodging(prismaClient(), eventId, userId);
}

/** Bandeja de Hospedaje: reservas vivas y habitaciones donde ponerlas. */
export function lodgingAssignments(eventId: string) {
  return listAssignments(prismaClient(), eventId);
}
