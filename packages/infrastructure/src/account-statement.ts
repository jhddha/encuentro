import {
  computeBalance,
  creditBalance,
  decideConfirmation,
  money,
  toDecimalString,
  type ConfirmationDecision,
  type PaymentComputedState,
  type PaymentProofState,
  type RegistrationState,
} from '@encuentro/domain';

import { enLibros } from './booked-amount.js';
import { decimalText } from './decimal.js';
import type { PrismaClient } from './prisma.js';

/**
 * Estado de cuenta del peregrino — PAY-002, REG-017.
 *
 * Consulta de pantalla, no puerto de la capa de aplicación: el mismo trato que
 * reciben `listProofsPendingReview` y `findProofDetail`. Aquí no se decide
 * nada; se lee y se suma.
 *
 * **Las sumas las hace el dominio**, no esta capa ni la pantalla. `PAY-002`
 * dice que el saldo se calcula y nunca se edita, y NFR-014 prohíbe `float`: si
 * cada pantalla sumara por su cuenta con números de coma flotante, dos vistas
 * del mismo dinero acabarían discrepando en céntimos.
 */

export interface StatementCharge {
  readonly id: string;
  readonly concept: string;
  readonly amount: string;
  readonly paid: string;
  readonly outstanding: string;
}

export interface StatementPayment {
  readonly id: string;
  readonly amount: string;
  readonly approvedAt: Date;
  /** Número del Comprobante emitido (PAY-028). Nulo no debería ocurrir. */
  readonly receiptNumber: string | null;
  readonly receiptVoided: boolean;
}

export interface StatementProof {
  readonly id: string;
  readonly status: PaymentProofState;
  readonly version: number;
  readonly declaredAmount: string;
  readonly currency: string;

  /**
   * El mismo importe en la moneda de la gestión, o `null` si no hay tasa.
   *
   * El peregrino que transfiere cincuenta dólares ve sus cargos en bolivianos.
   * Sin la equivalencia al lado no puede saber si lo que envió alcanza, y esa
   * es justamente la pregunta que trae a esta pantalla.
   */
  readonly bookedAmount: string | null;

  readonly reference: string;
  readonly paidAt: Date;
  readonly submittedAt: Date;
  readonly channelCode: string;
  /** Motivo del rechazo o de la corrección pedida — PAY-026. */
  readonly reviewReason: string | null;
}

export interface AccountStatement {
  readonly registrationId: string;
  readonly registrationCode: string;
  readonly registrationStatus: RegistrationState;
  readonly packageName: string;
  readonly paymentMode: string;
  readonly currency: string;

  readonly charges: readonly StatementCharge[];
  readonly payments: readonly StatementPayment[];
  readonly proofs: readonly StatementProof[];

  readonly charged: string;
  readonly allocated: string;
  readonly outstanding: string;
  /** Saldo a favor — DEC-008. Lo cobrado que no se repartió contra ningún cargo. */
  readonly credit: string;
  readonly balanceState: PaymentComputedState;

  /** Por qué la inscripción está o no confirmada — REG-017. */
  readonly confirmation: ConfirmationDecision | null;
}

/**
 * Estado de cuenta de la inscripción que un usuario tiene en una gestión.
 *
 * Se busca **por el usuario de la sesión**, no por un identificador que venga
 * de la URL. Es la diferencia entre una pantalla de autoservicio y un IDOR:
 * aceptar el identificador dejaría que cualquiera leyera el estado de cuenta de
 * cualquiera cambiando un número.
 *
 * Devuelve `null` si esa persona no está inscrita en esta gestión.
 */
export async function findAccountStatement(
  prisma: PrismaClient,
  eventId: string,
  userId: string,
): Promise<AccountStatement | null> {
  const registration = await prisma.registration.findFirst({
    where: { eventId, person: { userId } },
    select: {
      id: true,
      code: true,
      status: true,
      paymentMode: true,
      package: { select: { name: true } },
      event: { select: { currency: true } },
    },
  });

  if (registration === null) return null;

  const currency = registration.event.currency;

  const charges = await prisma.charge.findMany({
    where: { registrationId: registration.id },
    select: { id: true, concept: true, amount: true, currency: true },
    orderBy: { createdAt: 'asc' },
  });

  const allocations = await prisma.paymentAllocation.groupBy({
    by: ['chargeId'],
    where: { chargeId: { in: charges.map((charge) => charge.id) } },
    _sum: { amount: true },
  });

  const pagadoPorCargo = new Map(
    allocations.map((row) => [row.chargeId, row._sum.amount?.toString() ?? '0.00']),
  );

  /*
   * Solo los pagos `SUCCEEDED`. Un pago cancelado o revertido no es dinero que
   * la persona tenga a su favor, y mostrarlo en su estado de cuenta le diría
   * que pagó algo que no está cobrado.
   */
  const payments = await prisma.payment.findMany({
    where: { registrationId: registration.id, status: 'SUCCEEDED' },
    select: {
      id: true,
      amount: true,
      /*
       * La moneda del pago se **lee**, no se da por supuesta.
       *
       * Antes esta consulta no la pedía y etiquetaba cada importe con la de la
       * gestión. Mientras la aprobación entregaba el importe declarado sin
       * convertir, eso significaba que un pago de cincuenta dólares aparecía
       * aquí como cincuenta bolivianos, y sumaba como tal. La aprobación ya
       * convierte, así que la coincidencia está garantizada por construcción;
       * leerla es lo que impide que vuelva a darse por supuesta.
       */
      currency: true,
      approvedAt: true,
      receipt: { select: { number: true, voidedAt: true } },
    },
    orderBy: { approvedAt: 'asc' },
  });

  const proofs = await prisma.paymentProof.findMany({
    where: { registrationId: registration.id },
    select: {
      id: true,
      status: true,
      version: true,
      declaredAmount: true,
      currency: true,
      exchangeRateMicros: true,
      reference: true,
      paidAt: true,
      submittedAt: true,
      reviewReason: true,
      channel: { select: { code: true } },
    },
    orderBy: { submittedAt: 'desc' },
  });

  const importesCargos = charges.map((charge) => money(charge.amount.toString(), charge.currency));

  const importesAsignados = charges.map((charge) =>
    money(pagadoPorCargo.get(charge.id) ?? '0.00', currency),
  );

  /*
   * Los pagos entran con **su propia moneda**, no con la de la gestión.
   *
   * Si alguna vez difirieran, `creditBalance` lanza `MONEY_CURRENCY_MISMATCH` y
   * esta pantalla falla. Es deliberado: un estado de cuenta que reetiqueta
   * dólares como bolivianos miente sin avisar, y el peregrino tomaría
   * decisiones sobre ese número. Fallar es reparable; mentir en silencio no.
   */
  const importesPagos = payments.map((payment) =>
    money(payment.amount.toString(), payment.currency),
  );

  const balance = computeBalance({
    charges: importesCargos,
    allocations: importesAsignados,
    currency,
  });

  /*
   * REG-017 explicado, no solo aplicado.
   *
   * La pantalla del peregrino tiene que poder decir **por qué** no está
   * confirmado, y `decideConfirmation` es la misma regla que usa el caso de uso
   * que confirma. Duplicar el criterio aquí es exactamente lo que el requisito
   * prohíbe al pedir «política única de dominio».
   *
   * **Solo desde `SUBMITTED`**, que es el único estado desde el que
   * `CONFIRMED` es alcanzable. `decideConfirmation` lanza en los demás, y eso
   * incluye `DRAFT`: la columna `registrations.status` tiene `DRAFT` por
   * defecto en el esquema, así que cualquier fila creada sin estado explícito
   * —un fixture, el alta presencial de IAM-012 cuando exista— haría reventar
   * esta pantalla. Preguntar por `DRAFT` era un error, no una precaución.
   */
  const estado = registration.status as RegistrationState;

  const confirmation =
    estado === 'SUBMITTED'
      ? decideConfirmation({
          state: estado,
          outstanding: balance.outstanding,
          // El mecanismo de exención no existe todavía; ver
          // `packages/domain/src/registration.ts`.
          fullExemptionApproved: false,
        })
      : null;

  return {
    registrationId: registration.id,
    registrationCode: registration.code,
    registrationStatus: estado,
    packageName: registration.package.name,
    paymentMode: registration.paymentMode,
    currency,

    charges: charges.map((charge, indice) => ({
      id: charge.id,
      concept: charge.concept,
      amount: toDecimalString(importesCargos[indice] ?? money('0.00', currency)),
      paid: toDecimalString(importesAsignados[indice] ?? money('0.00', currency)),
      outstanding: toDecimalString({
        amount: (importesCargos[indice]?.amount ?? 0) - (importesAsignados[indice]?.amount ?? 0),
        currency,
      }),
    })),

    payments: payments.map((payment) => ({
      id: payment.id,
      // `Decimal.toString()` quita los ceros finales; ver `decimalText`.
      amount: decimalText(payment.amount, payment.currency),
      approvedAt: payment.approvedAt,
      receiptNumber: payment.receipt?.number ?? null,
      receiptVoided: payment.receipt?.voidedAt != null,
    })),

    proofs: proofs.map((proof) => ({
      id: proof.id,
      status: proof.status as PaymentProofState,
      version: proof.version,
      declaredAmount: decimalText(proof.declaredAmount, proof.currency),
      currency: proof.currency,
      bookedAmount: enLibros({
        declaredText: decimalText(proof.declaredAmount, proof.currency),
        declaredCurrency: proof.currency,
        bookCurrency: currency,
        rateMicros: proof.exchangeRateMicros,
      }).booked,
      reference: proof.reference,
      paidAt: proof.paidAt,
      submittedAt: proof.submittedAt,
      channelCode: proof.channel.code,
      reviewReason: proof.reviewReason,
    })),

    charged: toDecimalString(balance.charged),
    allocated: toDecimalString(balance.paid),
    outstanding: toDecimalString(balance.outstanding),
    credit: toDecimalString(creditBalance(importesPagos, importesAsignados, currency)),
    balanceState: balance.state,

    confirmation,
  };
}

/**
 * Canales por los que el peregrino puede declarar un pago anticipado.
 *
 * Excluye los de llegada (`CASH`, `CASH_QR`): PAY-024 los reserva para caja, y
 * ofrecerlos aquí invitaría a declarar por autoservicio un efectivo que nadie
 * ha contado.
 */
export interface AdvanceChannelOption {
  readonly id: string;
  readonly code: string;
  readonly currency: string;
  readonly instructions: string | null;
}

export async function listAdvanceChannels(
  prisma: PrismaClient,
  eventId: string,
  advanceCodes: readonly string[],
): Promise<readonly AdvanceChannelOption[]> {
  const rows = await prisma.paymentChannel.findMany({
    where: {
      active: true,
      code: { in: [...advanceCodes] },
      // Los globales (`event_id` nulo) valen para cualquier gestión.
      OR: [{ eventId }, { eventId: null }],
    },
    select: { id: true, code: true, currency: true, instructions: true },
    orderBy: { code: 'asc' },
  });

  return rows;
}
