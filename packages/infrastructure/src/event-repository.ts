import type {
  ApplyTransitionInput,
  CreateEventInput,
  EventRecord,
  EventRepository,
} from '@encuentro/application';
import type { EventState } from '@encuentro/domain';

import type { PrismaClient } from './prisma.js';

/** Fila de `events` tal como la devuelve Prisma. */
interface EventRow {
  id: string;
  code: string;
  year: number;
  name: string;
  timezone: string;
  currency: string;
  startAt: Date;
  endAt: Date;
  status: string;
  version: number;
  publiclyEnabled: boolean | null;
}

function toRecord(row: EventRow): EventRecord {
  return {
    id: row.id,
    code: row.code,
    year: row.year,
    name: row.name,
    timezone: row.timezone,
    currency: row.currency,
    startAt: row.startAt,
    endAt: row.endAt,
    status: row.status as EventState,
    version: row.version,
    // La columna es TRUE o NULL, nunca FALSE (ver migración P03).
    publiclyEnabled: row.publiclyEnabled === true,
  };
}

export function createEventRepository(prisma: PrismaClient): EventRepository {
  return {
    async findById(id) {
      const row = await prisma.event.findUnique({ where: { id } });
      return row === null ? null : toRecord(row);
    },

    async findByCode(code) {
      const row = await prisma.event.findUnique({ where: { code } });
      return row === null ? null : toRecord(row);
    },

    async list() {
      const rows = await prisma.event.findMany({ orderBy: { year: 'desc' } });
      return rows.map(toRecord);
    },

    async findPubliclyEnabled() {
      // EVT-006: un índice único parcial garantiza que haya como mucho una.
      const row = await prisma.event.findFirst({ where: { publiclyEnabled: true } });
      return row === null ? null : toRecord(row);
    },

    async create(input: CreateEventInput) {
      // La creación y su registro de auditoría comparten transacción: un alta
      // sin rastro sería tan inválida como no haberla hecho (GOV-005).
      return await prisma.$transaction(async (tx) => {
        const row = await tx.event.create({
          data: {
            code: input.code,
            year: input.year,
            name: input.name,
            timezone: input.timezone,
            currency: input.currency,
            startAt: input.startAt,
            endAt: input.endAt,
          },
        });

        await tx.auditLog.create({
          data: {
            eventId: row.id,
            actorId: input.actorId,
            action: 'event.create',
            entity: 'event',
            entityId: row.id,
            afterRedacted: {
              code: row.code,
              year: row.year,
              status: row.status,
              startAt: row.startAt.toISOString(),
              endAt: row.endAt.toISOString(),
            },
          },
        });

        return toRecord(row);
      });
    },

    async applyTransition(input: ApplyTransitionInput) {
      return await prisma.$transaction(async (tx) => {
        // Estado previo, para que la auditoría registre de dónde venía y no
        // solo a dónde fue. Leerlo aquí no abre una carrera: quien decide el
        // ganador es el WHERE del `updateMany` de abajo.
        const before = await tx.event.findUnique({
          where: { id: input.eventId },
          select: { status: true, version: true },
        });

        if (before === null) {
          return null;
        }

        /*
         * Compare-and-swap en una sola sentencia.
         *
         * `updateMany` con la versión esperada en el WHERE deja que Postgres
         * resuelva la carrera: la segunda transacción encuentra `count === 0` y
         * se retira. Leer y luego escribir sin esa condición dejaría una ventana
         * en la que ambas se creerían ganadoras.
         */
        const updated = await tx.event.updateMany({
          where: { id: input.eventId, version: input.expectedVersion },
          data: { status: input.to, version: { increment: 1 } },
        });

        if (updated.count === 0) {
          return null;
        }

        const row = await tx.event.findUniqueOrThrow({ where: { id: input.eventId } });

        await tx.auditLog.create({
          data: {
            eventId: row.id,
            actorId: input.actorId,
            action: 'event.transition',
            entity: 'event',
            entityId: row.id,
            ...(input.reason === undefined ? {} : { reason: input.reason }),
            beforeRedacted: { status: before.status, version: before.version },
            afterRedacted: { status: row.status, version: row.version },
          },
        });

        return toRecord(row);
      });
    },
  };
}
