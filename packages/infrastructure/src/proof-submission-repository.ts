import type {
  PaymentChannelRecord,
  ProofForResubmission,
  ProofSubmissionRepository,
  ProofWriteResult,
  RegistrationForPayment,
  ResubmitProofInput,
  SubmitProofInput,
} from '@encuentro/application';
import { toDecimalString, type EventState, type PaymentProofState } from '@encuentro/domain';

import type { PrismaClient } from './prisma.js';

/**
 * Escritura de evidencias por el peregrino — PAY-018, PAY-025, PAY-027.
 *
 * Separado de `payment-proof-repository.ts` a propósito: aquel implementa el
 * puerto de la **revisión**, que mueve dinero y emite comprobantes. Este solo
 * deja constancia de que alguien dice haber pagado. Juntarlos pondría en el
 * mismo objeto la operación más delicada del sistema y la más inocua.
 */

/**
 * Violación de restricción única de Postgres, tal como la reporta Prisma.
 *
 * Se detecta por código y no por el texto del mensaje: el texto cambia entre
 * versiones y locales, el código no.
 *
 * **Dónde vienen las columnas depende de la versión.** Prisma clásico las pone
 * en `meta.target`; Prisma 7 con el driver adapter de Postgres deja
 * `meta.target` sin definir y las mete en
 * `meta.driverAdapterError.cause.constraint.fields`. Verificado contra el error
 * real, no supuesto: dar por buena la primera forma hacía que el duplicado
 * escapara como `P2002` sin traducir y llegara al peregrino como pantalla de
 * error en vez de como «esa referencia ya existe».
 *
 * Se leen las dos formas para que una actualización de Prisma en cualquier
 * dirección no vuelva a romperlo en silencio.
 */
interface DriverConstraint {
  readonly fields?: unknown;
  readonly name?: unknown;
}

/**
 * Aplana un valor desconocido a los textos que contenga.
 *
 * Se filtra por tipo en vez de convertir: un `String()` sobre algo que no sea
 * texto daría «[object Object]» y la comparación siguiente pasaría a ser
 * adivinanza.
 */
function comoTextos(valor: unknown): readonly string[] {
  if (typeof valor === 'string') return [valor];

  if (Array.isArray(valor)) {
    return (valor as readonly unknown[]).filter((x): x is string => typeof x === 'string');
  }

  return [];
}

function camposDelConflicto(error: unknown): readonly string[] {
  const meta = (error as { meta?: Record<string, unknown> }).meta ?? {};

  const constraint = (
    meta.driverAdapterError as { cause?: { constraint?: DriverConstraint } } | undefined
  )?.cause?.constraint;

  return [
    ...comoTextos(meta.target),
    ...comoTextos(constraint?.fields),
    ...comoTextos(constraint?.name),
  ];
}

function esReferenciaDuplicada(error: unknown): boolean {
  if ((error as { code?: unknown }).code !== 'P2002') return false;

  /*
   * Solo el índice `(event_id, reference)` significa PAY-027. Cualquier otra
   * colisión única sería un fallo distinto, y tratarla como referencia
   * duplicada le diría al peregrino algo falso sobre su comprobante.
   */
  return camposDelConflicto(error).some((campo) => campo.includes('reference'));
}

export function createProofSubmissionRepository(prisma: PrismaClient): ProofSubmissionRepository {
  return {
    async findRegistrationForPayment(registrationId): Promise<RegistrationForPayment | null> {
      const row = await prisma.registration.findUnique({
        where: { id: registrationId },
        select: {
          id: true,
          eventId: true,
          status: true,
          event: { select: { status: true, currency: true, timezone: true } },
          person: { select: { userId: true } },
        },
      });

      if (row === null) return null;

      return {
        id: row.id,
        eventId: row.eventId,
        eventStatus: row.event.status as EventState,
        eventCurrency: row.event.currency,
        eventTimezone: row.event.timezone,
        status: row.status as RegistrationForPayment['status'],
        ownerUserId: row.person.userId,
      };
    },

    async findChannel(channelId): Promise<PaymentChannelRecord | null> {
      const row = await prisma.paymentChannel.findUnique({
        where: { id: channelId },
        select: { id: true, eventId: true, code: true, currency: true, active: true },
      });

      return row;
    },

    async findForResubmission(proofId): Promise<ProofForResubmission | null> {
      const row = await prisma.paymentProof.findUnique({
        where: { id: proofId },
        select: {
          id: true,
          eventId: true,
          registrationId: true,
          status: true,
          version: true,
          event: { select: { status: true, currency: true, timezone: true } },
          channel: { select: { currency: true } },
          registration: { select: { person: { select: { userId: true } } } },
        },
      });

      if (row === null) return null;

      return {
        id: row.id,
        eventId: row.eventId,
        eventStatus: row.event.status as EventState,
        eventCurrency: row.event.currency,
        eventTimezone: row.event.timezone,
        registrationId: row.registrationId,
        ownerUserId: row.registration.person.userId,
        status: row.status as PaymentProofState,
        channelCurrency: row.channel.currency,
        version: row.version,
      };
    },

    async submit(input: SubmitProofInput): Promise<ProofWriteResult> {
      try {
        return await prisma.$transaction(async (tx) => {
          const proof = await tx.paymentProof.create({
            data: {
              eventId: input.eventId,
              registrationId: input.registrationId,
              channelId: input.channelId,
              declaredAmount: toDecimalString(input.amount),
              currency: input.amount.currency,
              paidAt: input.paidAt,
              reference: input.reference,
              payerName: input.payerName,
              fileId: input.file.fileId,
              fileChecksum: input.file.checksum,
              /*
               * PAY-025: nace `SUBMITTED`, no `PENDING_UPLOAD`. El archivo ya
               * está guardado cuando se escribe esta fila, así que no existe el
               * momento intermedio que ese estado describiría.
               */
              status: 'SUBMITTED',
            },
            select: { id: true },
          });

          await tx.auditLog.create({
            data: {
              eventId: input.eventId,
              actorId: input.actorId,
              action: 'payment.proof.submit',
              entity: 'payment_proof',
              entityId: proof.id,
              /*
               * Sin nombre del pagador ni checksum completo: la auditoría
               * registra qué ocurrió, no la PII de quien lo hizo (regla
               * 03-security-rbac). El importe y la referencia sí, porque son lo
               * que permite reconstruir el movimiento.
               */
              afterRedacted: {
                status: 'SUBMITTED',
                amount: toDecimalString(input.amount),
                currency: input.amount.currency,
                reference: input.reference,
                channelId: input.channelId,
              },
            },
          });

          return { ok: true, proofId: proof.id } as const;
        });
      } catch (error) {
        if (esReferenciaDuplicada(error)) {
          return { ok: false, reason: 'DUPLICATE_REFERENCE' };
        }
        throw error;
      }
    },

    async resubmit(input: ResubmitProofInput): Promise<ProofWriteResult> {
      try {
        return await prisma.$transaction(async (tx) => {
          const updated = await tx.paymentProof.updateMany({
            /*
             * El estado va en el `where`, no solo la versión. Dos correcciones
             * enviadas a la vez tendrían la misma versión esperada y la segunda
             * encontraría la fila ya en `SUBMITTED`: quedar segundo es un
             * resultado previsto, no un fallo.
             */
            where: {
              id: input.proofId,
              version: input.expectedVersion,
              status: 'CORRECTION_REQUESTED',
            },
            data: {
              status: 'SUBMITTED',
              declaredAmount: toDecimalString(input.amount),
              currency: input.amount.currency,
              paidAt: input.paidAt,
              reference: input.reference,
              payerName: input.payerName,
              fileId: input.file.fileId,
              fileChecksum: input.file.checksum,
              submittedAt: new Date(),
              /*
               * La revisión anterior se limpia. Dejar el motivo del rechazo
               * junto a la evidencia ya corregida haría que el revisor leyera
               * como pendiente algo que el peregrino ya atendió; el rastro de
               * por qué se pidió la corrección queda en `audit_logs`, que no se
               * reescribe (GOV-009).
               */
              reviewedAt: null,
              reviewedBy: null,
              reviewReason: null,
              version: { increment: 1 },
            },
          });

          if (updated.count === 0) return { ok: false, reason: 'CONFLICT' } as const;

          await tx.auditLog.create({
            data: {
              eventId: input.eventId,
              actorId: input.actorId,
              action: 'payment.proof.resubmit',
              entity: 'payment_proof',
              entityId: input.proofId,
              afterRedacted: {
                status: 'SUBMITTED',
                amount: toDecimalString(input.amount),
                currency: input.amount.currency,
                reference: input.reference,
              },
            },
          });

          return { ok: true, proofId: input.proofId } as const;
        });
      } catch (error) {
        if (esReferenciaDuplicada(error)) {
          return { ok: false, reason: 'DUPLICATE_REFERENCE' };
        }
        throw error;
      }
    },
  };
}
