import type {
  ApproveProofInput,
  PaymentProofRepository,
  ProofForReview,
  RecordReviewInput,
} from '@encuentro/application';
import {
  computeBalance,
  formatReceiptNumber,
  money,
  shouldConfirm,
  toDecimalString,
  type PaymentProofState,
  type RegistrationState,
} from '@encuentro/domain';

import { decimalText } from './decimal.js';
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

/** Cliente dentro de una transacción interactiva de Prisma. */
type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

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

/** Fila de la bandeja de revisión. Solo lectura, para la pantalla. */
export interface ProofInboxRow {
  readonly id: string;
  readonly status: PaymentProofState;
  /** Necesaria para el compare-and-swap de la acción. */
  readonly version: number;
  readonly declaredAmount: string;
  readonly currency: string;
  readonly reference: string;
  readonly paidAt: Date;
  readonly registrationCode: string;
  readonly channelCode: string;
}

/**
 * Bandeja de evidencias pendientes de revisión.
 *
 * Solo los estados revisables (`isReviewable`): lo aprobado y lo rechazado ya no
 * requieren acción y llenarían la bandeja de ruido. Las más antiguas primero,
 * porque quien subió su comprobante hace tres días lleva tres días esperando.
 */
export async function listProofsPendingReview(
  prisma: PrismaClient,
  eventId: string,
): Promise<readonly ProofInboxRow[]> {
  const rows = await prisma.paymentProof.findMany({
    where: { eventId, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
    orderBy: { submittedAt: 'asc' },
    select: {
      id: true,
      status: true,
      version: true,
      declaredAmount: true,
      currency: true,
      reference: true,
      paidAt: true,
      registration: { select: { code: true } },
      channel: { select: { code: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    status: row.status as PaymentProofState,
    version: row.version,
    // `Decimal.toString()` quita los ceros finales; ver `decimalText`.
    declaredAmount: decimalText(row.declaredAmount, row.currency),
    currency: row.currency,
    reference: row.reference,
    paidAt: row.paidAt,
    registrationCode: row.registration.code,
    channelCode: row.channel.code,
  }));
}

/** Detalle de una evidencia para la pantalla de revisión. */
export interface ProofDetail {
  readonly id: string;
  readonly eventId: string;
  readonly status: PaymentProofState;
  readonly version: number;
  readonly declaredAmount: string;
  readonly currency: string;
  readonly reference: string;
  readonly paidAt: Date;
  readonly payerName: string | null;
  /** Clave del objeto. Nula mientras el peregrino no haya adjuntado nada. */
  readonly fileId: string | null;
  readonly fileChecksum: string | null;
  readonly channelCode: string;
  readonly registrationCode: string;
  readonly personName: string;
  readonly charges: readonly {
    readonly id: string;
    readonly concept: string;
    readonly outstanding: string;
  }[];
}

/**
 * Detalle para revisar.
 *
 * Devuelve el **saldo pendiente** de cada cargo, no su importe original: quien
 * reparte el pago necesita saber cuánto falta, no cuánto costó. Mostrar el
 * importe original llevaría a asignar de más contra un cargo ya pagado a medias,
 * que es justo lo que `PAY-020` rechaza.
 */
export async function findProofDetail(
  prisma: PrismaClient,
  proofId: string,
): Promise<ProofDetail | null> {
  const proof = await prisma.paymentProof.findUnique({
    where: { id: proofId },
    select: {
      id: true,
      eventId: true,
      status: true,
      version: true,
      declaredAmount: true,
      currency: true,
      reference: true,
      paidAt: true,
      payerName: true,
      fileId: true,
      fileChecksum: true,
      channel: { select: { code: true } },
      registration: {
        select: { id: true, code: true, person: { select: { fullName: true } } },
      },
    },
  });

  if (proof === null) return null;

  const charges = await prisma.charge.findMany({
    where: { registrationId: proof.registration.id },
    select: { id: true, concept: true, amount: true, currency: true },
    orderBy: { createdAt: 'asc' },
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
    status: proof.status as PaymentProofState,
    version: proof.version,
    declaredAmount: decimalText(proof.declaredAmount, proof.currency),
    currency: proof.currency,
    reference: proof.reference,
    paidAt: proof.paidAt,
    payerName: proof.payerName,
    fileId: proof.fileId,
    fileChecksum: proof.fileChecksum,
    channelCode: proof.channel.code,
    registrationCode: proof.registration.code,
    personName: proof.registration.person.fullName,
    charges: charges
      .map((charge) => ({
        id: charge.id,
        concept: charge.concept,
        outstanding: toDecimalString(
          subtractDecimals(
            charge.amount.toString(),
            paidByCharge.get(charge.id) ?? '0.00',
            charge.currency,
          ),
        ),
      }))
      // Un cargo ya saldado no admite más asignación (PAY-020); ofrecerlo solo
      // invita a un rechazo que el revisor no entendería.
      .filter((charge) => charge.outstanding !== '0.00'),
  };
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

        // REG-017, camino derivado. Ver `confirmIfSettled`.
        await confirmIfSettled(tx, {
          registrationId: input.registrationId,
          eventId: proof.eventId,
          actorId: input.actorId,
          paymentId: payment.id,
        });

        return true;
      });
    },
  };
}

/**
 * Confirma la inscripción si este pago dejó el saldo en cero — REG-017.
 *
 * Ocurre **dentro de la transacción que aprueba**, y no después, porque las dos
 * cosas son el mismo hecho: si el dinero entró y ya no se debe nada, la persona
 * está inscrita. Separarlas dejaría una ventana en la que el peregrino ve su
 * saldo a cero y su inscripción sin confirmar, y esa ventana duraría para
 * siempre si el proceso muriera en medio.
 *
 * El saldo se **relee de la base**, con las asignaciones recién escritas ya
 * dentro. Calcularlo a partir de lo que el caso de uso vio antes de escribir
 * daría un número de hace unos milisegundos, y esto decide si alguien está
 * inscrito.
 *
 * No lanza nunca. Una inscripción cancelada o ya confirmada por el camino
 * manual no es un error del que la aprobación deba enterarse: `shouldConfirm`
 * devuelve `false` y el pago sigue su curso. Reventar aquí sería perder un cobro
 * por una carrera que el sistema ya sabe resolver.
 */
async function confirmIfSettled(
  tx: TransactionClient,
  input: {
    registrationId: string;
    eventId: string;
    actorId: string;
    paymentId: string;
  },
): Promise<void> {
  const registration = await tx.registration.findUnique({
    where: { id: input.registrationId },
    select: { status: true, version: true, event: { select: { currency: true } } },
  });

  if (registration === null) return;

  const currency = registration.event.currency;

  const charges = await tx.charge.findMany({
    where: { registrationId: input.registrationId },
    select: { id: true, amount: true, currency: true },
  });

  const allocated = await tx.paymentAllocation.groupBy({
    by: ['chargeId'],
    where: { chargeId: { in: charges.map((charge) => charge.id) } },
    _sum: { amount: true },
  });

  const balance = computeBalance({
    charges: charges.map((charge) => money(charge.amount.toString(), charge.currency)),
    allocations: allocated.map((row) => money(row._sum.amount?.toString() ?? '0.00', currency)),
    currency,
  });

  const confirmable = shouldConfirm({
    state: registration.status as RegistrationState,
    outstanding: balance.outstanding,
    // El mecanismo de exención total es alcance aplazado; ver
    // `packages/domain/src/registration.ts`.
    fullExemptionApproved: false,
  });

  if (!confirmable) return;

  /*
   * Compare-and-swap sobre versión **y** estado. El camino manual de
   * `/admin/e/…/inscripciones` puede haber confirmado esta misma inscripción
   * mientras se revisaba el comprobante; quedar segundo aquí es correcto y
   * silencioso.
   */
  const updated = await tx.registration.updateMany({
    where: { id: input.registrationId, version: registration.version, status: 'SUBMITTED' },
    data: { status: 'CONFIRMED', version: { increment: 1 } },
  });

  if (updated.count === 0) return;

  await tx.auditLog.create({
    data: {
      eventId: input.eventId,
      actorId: input.actorId,
      action: 'registration.confirm',
      entity: 'registration',
      entityId: input.registrationId,
      /*
       * `derivedFrom` distingue esta confirmación de la que alguien pulsa en
       * Inscripciones. Ambas usan la misma acción para que un reporte las cuente
       * juntas, y el payload dice cuál fue cuál.
       */
      afterRedacted: {
        status: 'CONFIRMED',
        derivedFrom: 'payment.proof.approve',
        paymentId: input.paymentId,
      },
    },
  });
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
  tx: TransactionClient,
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
