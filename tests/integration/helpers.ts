import type { ActorResolver } from '@encuentro/application';
import type { Actor } from '@encuentro/domain';
import { createPrismaClient, type PrismaClient } from '@encuentro/infrastructure';

/**
 * Resuelve el actor y falla si no existe.
 *
 * Evita el `!` en cada prueba: si la resolución devuelve `null` por un error de
 * preparación, el fallo lo dice, en vez de reventar más adelante con un
 * `TypeError` que no explica nada.
 */
export async function requireActor(resolver: ActorResolver, userId: string): Promise<Actor> {
  const actor = await resolver.resolve(userId);
  if (actor === null) {
    throw new Error(`No se pudo resolver el actor ${userId}: revise la preparación de la prueba.`);
  }
  return actor;
}

export function testPrisma(): PrismaClient {
  return createPrismaClient(process.env.DATABASE_URL ?? '');
}

/**
 * Deja la base vacía entre pruebas.
 *
 * Usa TRUNCATE y no DELETE porque el trigger append-only de `audit_logs`
 * rechaza cualquier DELETE, incluso el de limpieza. En producción esa vía queda
 * cerrada: TRUNCATE exige ser propietario de la tabla y el rol de la aplicación
 * no debe serlo (pendiente de hardening en P14).
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  /*
   * Las tablas se descubren en el catálogo en lugar de enumerarlas.
   *
   * Con una lista escrita a mano, cada fase nueva deja tablas sin limpiar y el
   * estado se filtra entre pruebas — que es exactamente lo que ocurrió al
   * añadir `smtp_settings`: la fila singleton sobrevivía y hacía fallar la
   * prueba siguiente por un motivo que no era el real.
   */
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );

  if (tables.length === 0) return;

  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} CASCADE`);
}

export interface SeededActor {
  readonly userId: string;
  readonly roleId: string;
}

/** Crea una persona con un rol y los permisos indicados, en el ámbito dado. */
export async function seedActor(
  prisma: PrismaClient,
  options: {
    readonly email: string;
    readonly permissions: readonly string[];
    readonly scopeType: 'GLOBAL' | 'EVENT' | 'COMMISSION' | 'CASH';
    readonly eventId?: string;
    readonly commissionId?: string;
    readonly cashAccountId?: string;
    readonly roleCode?: string;
  },
): Promise<SeededActor> {
  const user = await prisma.user.create({
    data: { email: options.email, displayName: options.email },
  });

  const role = await prisma.role.create({
    data: {
      code: options.roleCode ?? `ROL-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Rol de prueba',
      permissions: { create: options.permissions.map((permission) => ({ permission })) },
    },
  });

  await prisma.roleAssignment.create({
    data: {
      userId: user.id,
      roleId: role.id,
      scopeType: options.scopeType,
      eventId: options.eventId ?? null,
      commissionId: options.commissionId ?? null,
      cashAccountId: options.cashAccountId ?? null,
    },
  });

  return { userId: user.id, roleId: role.id };
}

export async function seedEvent(
  prisma: PrismaClient,
  options: {
    readonly code: string;
    readonly year: number;
    readonly status?: string;
    readonly startAt?: Date;
    readonly endAt?: Date;
  },
): Promise<{ id: string; code: string; version: number; startAt: Date; endAt: Date }> {
  const row = await prisma.event.create({
    data: {
      code: options.code,
      year: options.year,
      name: `Encuentro ${String(options.year)}`,
      timezone: 'America/La_Paz',
      currency: 'USD',
      startAt: options.startAt ?? new Date('2026-11-01T00:00:00Z'),
      endAt: options.endAt ?? new Date('2026-11-08T23:59:59Z'),
      ...(options.status === undefined ? {} : { status: options.status }),
    },
  });

  return {
    id: row.id,
    code: row.code,
    version: row.version,
    startAt: row.startAt,
    endAt: row.endAt,
  };
}
