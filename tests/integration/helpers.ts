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
  await prisma.$executeRawUnsafe(
    'TRUNCATE audit_logs, role_assignments, role_permissions, roles, events, users CASCADE',
  );
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
): Promise<{ id: string; version: number }> {
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

  return { id: row.id, version: row.version };
}
