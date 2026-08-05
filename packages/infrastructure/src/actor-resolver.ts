import type { ActorResolver } from '@encuentro/application';
import type { Actor, Scope } from '@encuentro/domain';

import type { PrismaClient } from './prisma.js';

interface AssignmentRow {
  scopeType: string;
  eventId: string | null;
  commissionId: string | null;
  cashAccountId: string | null;
  role: { permissions: { permission: string }[] };
}

/**
 * Reconstruye el ámbito a partir de la fila.
 *
 * Devuelve `null` si las columnas no encajan con el tipo declarado. La
 * migración ya lo impide con un CHECK, pero una asignación mal formada que
 * llegara por cualquier vía debe descartarse, no interpretarse a la ligera:
 * adivinar aquí concedería alcance que nadie otorgó.
 */
function toScope(row: AssignmentRow): Scope | null {
  switch (row.scopeType) {
    case 'GLOBAL':
      return { type: 'GLOBAL' };

    case 'EVENT':
      return row.eventId === null ? null : { type: 'EVENT', eventId: row.eventId };

    case 'COMMISSION':
      return row.eventId === null || row.commissionId === null
        ? null
        : { type: 'COMMISSION', eventId: row.eventId, commissionId: row.commissionId };

    case 'CASH':
      return row.eventId === null || row.cashAccountId === null
        ? null
        : { type: 'CASH', eventId: row.eventId, cashAccountId: row.cashAccountId };

    default:
      return null;
  }
}

export function createActorResolver(prisma: PrismaClient): ActorResolver {
  return {
    async resolve(userId: string): Promise<Actor | null> {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          status: true,
          assignments: {
            select: {
              scopeType: true,
              eventId: true,
              commissionId: true,
              cashAccountId: true,
              role: { select: { permissions: { select: { permission: true } } } },
            },
          },
        },
      });

      // Una cuenta inactiva no conserva permisos.
      if (user?.status !== 'ACTIVE') {
        return null;
      }

      const assignments = user.assignments.flatMap((row) => {
        const scope = toScope(row);
        if (scope === null) return [];

        return [{ permissions: row.role.permissions.map((p) => p.permission), scope }];
      });

      return { userId: user.id, assignments };
    },
  };
}
