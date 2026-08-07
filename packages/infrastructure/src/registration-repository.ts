import { formatRegistrationCode, type RegistrationDraft } from '@encuentro/application';
import { toDecimalString } from '@encuentro/domain';

import type { PrismaClient } from './prisma.js';

/**
 * Inscripciones.
 *
 * El alta crea la inscripción y su cargo congelado en **una sola transacción**:
 * una inscripción sin cargo dejaría a alguien inscrito sin deber nada, y un
 * cargo sin inscripción sería un importe huérfano.
 */

export interface RegistrationRecord {
  readonly id: string;
  readonly code: string;
  readonly eventId: string;
  readonly personId: string;
  readonly packageId: string;
  readonly priceVersionId: string;
  readonly paymentMode: string;
  readonly status: string;
  readonly attendanceStatus: string;
}

export interface RegistrationRepository {
  hasRegistration(eventId: string, personId: string): Promise<boolean>;
  findByCode(eventId: string, code: string): Promise<RegistrationRecord | null>;
  listByEvent(eventId: string): Promise<readonly RegistrationRecord[]>;
  create(draft: RegistrationDraft, actorId: string): Promise<RegistrationRecord>;
}

export function createRegistrationRepository(prisma: PrismaClient): RegistrationRepository {
  return {
    async hasRegistration(eventId, personId) {
      const count = await prisma.registration.count({ where: { eventId, personId } });
      return count > 0;
    },

    async findByCode(eventId, code) {
      const row = await prisma.registration.findUnique({
        where: { eventId_code: { eventId, code } },
      });
      return row;
    },

    async listByEvent(eventId) {
      return await prisma.registration.findMany({
        where: { eventId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async create(draft, actorId) {
      return await prisma.$transaction(async (tx) => {
        const event = await tx.event.findUniqueOrThrow({
          where: { id: draft.eventId },
          select: { code: true },
        });

        /*
         * Número de inscripción.
         *
         * Se cuenta dentro de la transacción y el índice único
         * `(event_id, code)` decide la carrera: si dos altas simultáneas
         * calculan el mismo número, la segunda falla en el commit en lugar de
         * duplicar el código. Contar fuera de la transacción no daría esa
         * garantía.
         */
        const sequence = (await tx.registration.count({ where: { eventId: draft.eventId } })) + 1;

        const registration = await tx.registration.create({
          data: {
            eventId: draft.eventId,
            code: formatRegistrationCode(event.code, sequence),
            personId: draft.personId,
            packageId: draft.packageId,
            priceVersionId: draft.priceVersionId,
            paymentMode: draft.charge.paymentMode,
            status: 'SUBMITTED',
          },
        });

        await tx.charge.create({
          data: {
            registrationId: registration.id,
            concept: 'PACKAGE',
            amount: toDecimalString(draft.charge.amount),
            currency: draft.charge.amount.currency,
            // PAY-001: el snapshot conserva las condiciones exactas del alta.
            snapshot: {
              packageId: draft.charge.packageId,
              priceVersionId: draft.charge.priceVersionId,
              paymentMode: draft.charge.paymentMode,
              amount: toDecimalString(draft.charge.amount),
              currency: draft.charge.amount.currency,
              frozenAt: draft.charge.frozenAt.toISOString(),
            },
          },
        });

        await tx.auditLog.create({
          data: {
            eventId: draft.eventId,
            actorId,
            action: 'registration.create',
            entity: 'registration',
            entityId: registration.id,
            // Sin nombre ni fecha de nacimiento: la auditoría registra qué
            // ocurrió, no la PII de quien se inscribió.
            afterRedacted: {
              code: registration.code,
              packageId: draft.packageId,
              paymentMode: draft.charge.paymentMode,
              amount: toDecimalString(draft.charge.amount),
            },
          },
        });

        return registration;
      });
    },
  };
}
