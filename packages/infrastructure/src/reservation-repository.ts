import type {
  ExpireReservationInput,
  ReservationRecord,
  ReservationRepository,
} from '@encuentro/application';
import type { LodgingState } from '@encuentro/domain';

import type { PrismaClient } from './prisma.js';

/**
 * Reservas — lado de infraestructura de la expiración de `HELD` (DEC-005).
 *
 * Aquí no vive ninguna regla: la base filtra candidatas y escribe con
 * compare-and-swap, y quien decide si una reserva debe expirar es el caso de
 * uso `expireHeldReservations`.
 */

interface ReservationRow {
  id: string;
  eventId: string;
  status: string;
  createdAt: Date;
  heldUntil: Date | null;
  version: number;
}

function toRecord(row: ReservationRow): ReservationRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    status: row.status as LodgingState,
    createdAt: row.createdAt,
    heldUntil: row.heldUntil,
    version: row.version,
  };
}

export function createReservationRepository(prisma: PrismaClient): ReservationRepository {
  return {
    async findExpiryCandidates(now: Date, limit: number) {
      const rows = await prisma.reservation.findMany({
        where: { status: 'HELD', heldUntil: { lte: now } },
        // Las más antiguas primero: si el worker estuvo caído y se acumuló
        // trabajo, conviene liberar antes la cama que lleva más tiempo retenida.
        orderBy: { heldUntil: 'asc' },
        take: limit,
        select: {
          id: true,
          eventId: true,
          status: true,
          createdAt: true,
          heldUntil: true,
          version: true,
        },
      });

      return rows.map(toRecord);
    },

    async expire(input: ExpireReservationInput) {
      return await prisma.$transaction(async (tx) => {
        const before = await tx.reservation.findUnique({
          where: { id: input.reservationId },
          select: { status: true, version: true, hotelId: true, roomId: true },
        });

        if (before === null) {
          return false;
        }

        /*
         * Compare-and-swap con el estado dentro del WHERE, no solo la versión.
         *
         * `status: 'HELD'` es redundante con la versión en el caso normal, pero
         * es la última barrera contra el peor error posible de este worker:
         * expirar algo que ya se confirmó (HOS-012). Cuesta nada y cierra el
         * hueco.
         *
         * `heldUntil` debe quedar en NULL: la base tiene un CHECK que solo
         * permite valor mientras el estado es `HELD`, así que omitirlo haría
         * fallar la transacción entera.
         */
        const updated = await tx.reservation.updateMany({
          where: { id: input.reservationId, version: input.expectedVersion, status: 'HELD' },
          data: { status: 'EXPIRED', heldUntil: null, version: { increment: 1 } },
        });

        if (updated.count === 0) {
          return false;
        }

        const after = await tx.reservation.findUniqueOrThrow({
          where: { id: input.reservationId },
          select: { eventId: true, status: true, version: true },
        });

        await tx.auditLog.create({
          data: {
            eventId: after.eventId,
            actorId: input.actorId,
            action: 'lodging.reservation.expire',
            entity: 'reservation',
            entityId: input.reservationId,
            reason: input.reason,
            beforeRedacted: { status: before.status, version: before.version },
            afterRedacted: { status: after.status, version: after.version },
          },
        });

        return true;
      });
    },
  };
}
