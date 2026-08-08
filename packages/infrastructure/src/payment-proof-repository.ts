import type {
  ApproveProofInput,
  PaymentProofRepository,
  ProofForReview,
  RecordReviewInput,
} from '@encuentro/application';
import {
  formatReceiptNumber,
  money,
  toDecimalString,
  type PaymentProofState,
} from '@encuentro/domain';

import { createReceiptToken } from './receipt-token.js';
import type { PrismaClient } from './prisma.js';

/**
 * Evidencias de pago — lado de infraestructura de PAY-025 … PAY-033.
 *
 * `approve` es la operación más delicada del sistema: en una sola transacción
 * mueve la evidencia a `APPROVED`, crea el pago, escribe las asignaciones, emite
 * el comprobante numerado y audita.
 *
 * **Todo junto o nada.** Un pago sin comprobante deja al peregrino sin
 * justificante de algo que sí pagó; un comprobante sin asignaciones deja el
 * estado de cuenta diciendo que aún debe. Cada mitad, por separado, miente.
 */

export interface ReceiptSecret {
  /** `RECEIPT_VERIFICATION_SECRET`. No se persiste. */
  readonly verificationSecret: string;
}

interface ProofRow {
  id: string;
  eventId: string;
  registrationId: string;
  declaredAmount: { toString(): string };
  currency: string;
  status: string;
  version: number;
  event: { status: string; code: string };
}

export function createPaymentProofRepository(
  prisma: PrismaClient,
  secret: ReceiptSecret,
): PaymentProofRepository {
  return {
    async findForReview(proofId: string): Promise<ProofForReview | null> {
      const proof = (await prisma.paymentProof.findUnique({
        where: { id: proofId },
        select: {
          id: true,
          eventId: true,
          registrationId: true,
          declaredAmount: true,
          currency: true,
          status: true,
          version: true,
          reference: true,
          event: { select: { status: true, code: true } },
        },
      })) as (ProofRow & { reference: string }) | null;

      if (proof === null) return null;

      /*
       * PAY-027. La base ya impone `@@unique([eventId, reference])`, así que un
       * duplicado no puede llegar a existir: esta comprobación cubre el caso en
       * que la referencia se repita contra una evidencia **ya aprobada** de otra
       * inscripción, que el índice permite si la primera se creó antes.
       */
      const duplicate = await prisma.paymentProof.count({
        where: {
          eventId: proof.eventId,
          reference: proof.reference,
          status: 'APPROVED',
          id: { not: proof.id },
        },
      });

      const charges = await prisma.charge.findMany({
        where: { registrationId: proof.registrationId },
        select: { id: true, amount: true, currency: true },
      });

      const allocated = await prisma.paymentAllocation.groupBy({
        by: ['chargeId'],
        where: { chargeId: { in: charges.map((charge) => charge.id) } },
        _sum: { amount: true },
      });

      const paidByCharge = new Map(
        allocated.map((row) => [row.chargeId, row._sum.amount?.toString() ?? '0.00']),
      );

      return {
        id: proof.id,
        eventId: proof.eventId,
        eventStatus: proof.event.status as ProofForReview['eventStatus'],
        registrationId: proof.registrationId,
        status: proof.status as PaymentProofState,
        amount: money(proof.declaredAmount.toString(), proof.currency),
        charges: charges.map((charge) => ({
          chargeId: charge.id,
          outstanding: subtractDecimals(
            charge.amount.toString(),
            paidByCharge.get(charge.id) ?? '0.00',
            charge.currency,
          ),
        })),
        duplicateReference: duplicate > 0,
        version: proof.version,
      };
    },

    async takeForReview(input) {
      return await prisma.$transaction(async (tx) => {
        const updated = await tx.paymentProof.updateMany({
          where: { id: input.proofId, version: input.expectedVersion, status: 'SUBMITTED' },
          data: { status: 'UNDER_REVIEW', reviewedBy: input.actorId, version: { increment: 1 } },
        });

        if (updated.count === 0) return false;

        await writeAudit(tx, {
          proofId: input.proofId,
          actorId: input.actorId,
          action: 'payment.proof.take_for_review',
          after: { status: 'UNDER_REVIEW' },
        });

        return true;
      });
    },

    async recordReview(input: RecordReviewInput) {
      return await prisma.$transaction(async (tx) => {
        const updated = await tx.paymentProof.updateMany({
          where: { id: input.proofId, version: input.expectedVersion, status: 'UNDER_REVIEW' },
          data: {
            status: input.outcome,
            reviewedAt: new Date(),
            reviewedBy: input.actorId,
            reviewReason: input.reason,
            version: { increment: 1 },
          },
        });

        if (updated.count === 0) return false;

        await writeAudit(tx, {
          proofId: input.proofId,
          actorId: input.actorId,
          action: 'payment.proof.review',
          reason: input.reason,
          after: { status: input.outcome },
        });

        return true;
      });
    },

    async approve(input: ApproveProofInput) {
      return await prisma.$transaction(async (tx) => {
        const proof = await tx.paymentProof.findUnique({
          where: { id: input.proofId },
          select: { eventId: true, event: { select: { code: true } } },
        });

        if (proof === null) return false;

        /*
         * Serializa la numeración de comprobantes de **esta** gestión.
         *
         * `receipts` no tiene secuencia de base: el número se calcula. Sin este
         * cerrojo, dos aprobaciones simultáneas leerían el mismo máximo, y una
         * moriría contra el índice único `(event_id, sequence)`. Con él, la
         * segunda espera y obtiene el número siguiente. PAY-014 pide exactamente
         * esto: «concurrencia no duplica».
         *
         * Es un cerrojo de transacción: se libera al terminar, pase lo que pase.
         */
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${proof.eventId}))`;

        const updated = await tx.paymentProof.updateMany({
          where: { id: input.proofId, version: input.expectedVersion, status: 'UNDER_REVIEW' },
          data: {
            status: 'APPROVED',
            reviewedAt: new Date(),
            reviewedBy: input.actorId,
            version: { increment: 1 },
          },
        });

        if (updated.count === 0) return false;

        // PAY-025: solo APPROVED crea el pago. Aquí es donde entra el dinero.
        const payment = await tx.payment.create({
          data: {
            eventId: proof.eventId,
            registrationId: input.registrationId,
            amount: toDecimalString(input.amount),
            currency: input.amount.currency,
            method: 'MANUAL_PROOF',
            status: 'SUCCEEDED',
            sourceProofId: input.proofId,
            approvedBy: input.actorId,
          },
          select: { id: true },
        });

        if (input.allocations.length > 0) {
          await tx.paymentAllocation.createMany({
            data: input.allocations.map((allocation) => ({
              paymentId: payment.id,
              chargeId: allocation.chargeId,
              amount: toDecimalString(allocation.amount),
              currency: allocation.amount.currency,
            })),
          });
        }

        // PAY-028: cada pago aprobado genera su comprobante, incluido el parcial.
        const last = await tx.receipt.findFirst({
          where: { eventId: proof.eventId },
          orderBy: { sequence: 'desc' },
          select: { sequence: true },
        });

        const sequence = (last?.sequence ?? 0) + 1;
        const token = createReceiptToken(secret.verificationSecret);

        await tx.receipt.create({
          data: {
            eventId: proof.eventId,
            paymentId: payment.id,
            sequence,
            number: formatReceiptNumber(proof.event.code, sequence),
            verificationTokenHash: token.hash,
            /*
             * PAY-030 y PAY-033: el comprobante es inmutable, así que guarda una
             * copia de lo que decía al emitirse. Si mañana cambia el nombre del
             * paquete, el comprobante ya emitido sigue diciendo lo que dijo.
             */
            snapshot: {
              amount: toDecimalString(input.amount),
              currency: input.amount.currency,
              allocations: input.allocations.map((allocation) => ({
                chargeId: allocation.chargeId,
                amount: toDecimalString(allocation.amount),
              })),
              credit: toDecimalString(input.credit),
              footer: 'Documento de control interno',
            },
          },
        });

        await writeAudit(tx, {
          proofId: input.proofId,
          actorId: input.actorId,
          action: 'payment.proof.approve',
          after: {
            status: 'APPROVED',
            paymentId: payment.id,
            receiptSequence: sequence,
            credit: toDecimalString(input.credit),
          },
        });

        return true;
      });
    },
  };
}

/**
 * Resta dos decimales pasando por el dominio.
 *
 * Evita `parseFloat`: restar dinero en coma flotante es exactamente el error que
 * `requirements.md` §10 prohíbe, y aquí produciría saldos con un céntimo de
 * diferencia que nadie sabría explicar.
 */
function subtractDecimals(chargeAmount: string, paidAmount: string, currency: string) {
  const charged = money(chargeAmount, currency);
  const paid = money(paidAmount, currency);
  return money(toDecimalString({ amount: charged.amount - paid.amount, currency }), currency);
}

async function writeAudit(
  tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  entry: {
    proofId: string;
    actorId: string;
    action: string;
    reason?: string;
    after: object;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: 'payment_proof',
      entityId: entry.proofId,
      ...(entry.reason === undefined ? {} : { reason: entry.reason }),
      afterRedacted: entry.after,
    },
  });
}
