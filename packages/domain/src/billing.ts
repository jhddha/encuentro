import { DomainError } from './errors.js';
import {
  add,
  compare,
  isNegative,
  isZero,
  subtract,
  sum,
  toDecimalString,
  type Money,
} from './money.js';
import type { PaymentComputedState, PaymentProofState } from './states.js';

/**
 * Facturación: evidencias, pagos, asignaciones y comprobantes.
 *
 * DEC-002 gobierna el módulo entero: v1 **no tiene checkout automático**. Nadie
 * confirma un pago salvo una persona autorizada revisando una evidencia. De ahí
 * que no exista aquí ningún concepto de «webhook», «callback» ni «proveedor».
 */

/**
 * Canales de pago — PAY-023 y PAY-024.
 *
 * Todos manuales, por definición. DEC-015 cerró formalmente el alcance de una
 * integración automática con QR bancario: el QR es el medio por el que la
 * persona transfiere, no un sistema que confirme por su cuenta.
 */
export const ADVANCE_CHANNELS = [
  'BOLIVIA_QR_MANUAL',
  'US_ACCOUNT_MANUAL',
  'US_PAYMENT_LINK_MANUAL',
] as const;

export const ARRIVAL_CHANNELS = ['CASH', 'CASH_QR'] as const;

export type AdvanceChannel = (typeof ADVANCE_CHANNELS)[number];
export type ArrivalChannel = (typeof ARRIVAL_CHANNELS)[number];
export type PaymentChannel = AdvanceChannel | ArrivalChannel;

/**
 * Transiciones de una evidencia de pago.
 *
 * PAY-025: subir una evidencia **no confirma nada**. Solo `APPROVED` crea o
 * confirma un pago, y esa transición es la única que mueve dinero.
 */
const PROOF_TRANSITIONS: Readonly<Record<PaymentProofState, readonly PaymentProofState[]>> = {
  PENDING_UPLOAD: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['UNDER_REVIEW', 'CANCELLED', 'REPLACED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CORRECTION_REQUESTED'],
  CORRECTION_REQUESTED: ['SUBMITTED', 'CANCELLED', 'REPLACED'],
  REJECTED: ['REPLACED'],
  // Terminales: una evidencia aprobada ya produjo un pago, y rehacerla
  // significaría anular el pago, que es otra operación auditada (PAY-033).
  APPROVED: [],
  REPLACED: [],
  CANCELLED: [],
};

export function canTransitionProof(from: PaymentProofState, to: PaymentProofState): boolean {
  return PROOF_TRANSITIONS[from].includes(to);
}

/** Estados en los que una evidencia puede revisarse (`PAYMENT_PROOF_NOT_REVIEWABLE`). */
export function isReviewable(state: PaymentProofState): boolean {
  return state === 'SUBMITTED' || state === 'UNDER_REVIEW';
}

/**
 * Número de Comprobante de pago — PAY-014, DEC-003.
 *
 * `REC-{EVENT_CODE}-{NNNNNN}`, único **por gestión**. La secuencia la asigna la
 * base dentro de la transacción; aquí solo se da forma.
 */
export function formatReceiptNumber(eventCode: string, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new DomainError('RECEIPT_SEQUENCE_INVALID', `Secuencia no válida: ${String(sequence)}`);
  }

  return `REC-${eventCode}-${String(sequence).padStart(6, '0')}`;
}

/**
 * Saldo de una inscripción.
 *
 * PAY-002: el saldo se **calcula**, nunca se edita a mano. Esta función es la
 * única fuente de esa cifra.
 */
export interface BalanceInput {
  readonly charges: readonly Money[];
  readonly allocations: readonly Money[];
  readonly currency: string;
}

export interface Balance {
  readonly charged: Money;
  readonly paid: Money;
  /** Positivo si queda por pagar; negativo si hay saldo a favor. */
  readonly outstanding: Money;
  readonly state: PaymentComputedState;
}

export function computeBalance(input: BalanceInput): Balance {
  const charged = sum(input.charges, input.currency);
  const paid = sum(input.allocations, input.currency);
  const outstanding = subtract(charged, paid);

  return { charged, paid, outstanding, state: balanceState(charged, paid, outstanding) };
}

function balanceState(charged: Money, paid: Money, outstanding: Money): PaymentComputedState {
  if (paid.amount === 0) return 'UNPAID';
  // DEC-008: el sobrepago queda como saldo a favor, no se devuelve.
  if (isNegative(outstanding)) return 'OVERPAID';
  if (outstanding.amount === 0) return 'PAID';
  if (compare(paid, charged) < 0) return 'PARTIAL';
  return 'PAID';
}

/**
 * Saldo a favor — DEC-007 y DEC-008.
 *
 * v1 no devuelve dinero. Un sobrepago, o el importe de una inscripción
 * cancelada, queda registrado a favor de la persona. Esta función expresa esa
 * conversión y devuelve siempre un importe positivo o cero: un «saldo a favor
 * negativo» no significa nada.
 */
export function creditFromOverpayment(outstanding: Money): Money {
  if (!isNegative(outstanding)) {
    return { amount: 0, currency: outstanding.currency };
  }

  return { amount: -outstanding.amount, currency: outstanding.currency };
}

/**
 * Reparto de un pago entre cargos.
 *
 * PAY-002: un pago puede asignarse parcial o totalmente. Lo que **no** puede es
 * asignarse por encima de su propio importe: eso crearía dinero.
 */
export function assertAllocationsWithinPayment(
  paymentAmount: Money,
  allocations: readonly Money[],
): void {
  const allocated = sum(allocations, paymentAmount.currency);

  if (compare(allocated, paymentAmount) > 0) {
    throw new DomainError('PAYMENT_OVER_ALLOCATED', 'La suma asignada supera el importe del pago.');
  }
}

/** Parte del pago que aún no se ha asignado a ningún cargo. */
export function unallocatedAmount(paymentAmount: Money, allocations: readonly Money[]): Money {
  return subtract(paymentAmount, sum(allocations, paymentAmount.currency));
}

/**
 * PAY-019: no se permiten importes negativos en pagos ni en asignaciones.
 *
 * `money()` acepta texto decimal negativo a propósito, porque un saldo sí puede
 * serlo —un sobrepago da saldo negativo— pero un **pago** negativo no significa
 * nada: invertiría el sentido del cobro y descuadraría la caja sin dejar rastro
 * de una devolución, que además DEC-007 no admite en v1.
 *
 * El cero también se rechaza. Un pago de cero no es un pago, y una asignación de
 * cero solo añade una fila que no mueve saldo.
 */
export function assertPayableAmount(amount: Money, label: string): void {
  if (isNegative(amount) || isZero(amount)) {
    throw new DomainError(
      'MONEY_INVALID',
      `${label} debe ser un importe positivo (PAY-019); llegó ${toDecimalString(amount)}.`,
    );
  }
}

/** Asignación propuesta de un pago a un cargo concreto. */
export interface ChargeAllocationInput {
  readonly chargeId: string;
  /** Saldo del cargo **antes** de esta asignación. */
  readonly chargeOutstanding: Money;
  readonly amount: Money;
}

/**
 * PAY-020, lado del cargo.
 *
 * `assertAllocationsWithinPayment` ya impide asignar más de lo que entró. Falta
 * la otra mitad del requisito: tampoco se puede asignar a un cargo más de lo que
 * ese cargo debe. Sin esta comprobación, asignar 500 a un cargo de 300 dejaría
 * el saldo de la inscripción en negativo y la haría parecer un sobrepago que
 * nadie hizo.
 *
 * El excedente legítimo de un pago no se fuerza contra un cargo: queda sin
 * asignar y se convierte en saldo a favor (DEC-008).
 */
export function assertAllocationsWithinCharges(
  allocations: readonly ChargeAllocationInput[],
): void {
  for (const allocation of allocations) {
    assertPayableAmount(allocation.amount, `La asignación al cargo ${allocation.chargeId}`);

    if (compare(allocation.amount, allocation.chargeOutstanding) > 0) {
      throw new DomainError(
        'PAYMENT_OVER_ALLOCATED',
        `La asignación al cargo ${allocation.chargeId} supera su saldo pendiente (PAY-020).`,
      );
    }
  }
}

/**
 * Conversión de moneda con la tasa congelada — DEC-009.
 *
 * La tasa se fija **cuando el peregrino carga la evidencia**, no cuando alguien
 * la aprueba ni cuando se emite el comprobante. REG-021 ya protege a quien
 * carga dentro del plazo aunque la revisión llegue después; congelar aquí es
 * coherente con esa idea.
 *
 * La tasa se expresa en millonésimas para operar con enteros. Dividir en coma
 * flotante justo donde se convierte dinero es la clase de error que aparece
 * como un céntimo de descuadre en el cierre de caja.
 */
export const RATE_SCALE = 1_000_000;

export function convert(amount: Money, targetCurrency: string, rateMicros: number): Money {
  if (!Number.isInteger(rateMicros) || rateMicros <= 0) {
    throw new DomainError('MONEY_INVALID', `Tasa de cambio no válida: ${String(rateMicros)}`);
  }

  // Redondeo al céntimo más cercano, explícito y no dependiente del motor.
  const converted = Math.round((amount.amount * rateMicros) / RATE_SCALE);

  return { amount: converted, currency: targetCurrency };
}

/**
 * Total efectivamente cobrado en una sesión de caja — PAY-012.
 *
 * El cierre compara lo esperado con lo contado. La diferencia se calcula, no se
 * declara: si alguien pudiera escribir la diferencia directamente, el arqueo
 * dejaría de ser un control.
 */
export function cashDifference(expected: Money, counted: Money): Money {
  return subtract(counted, expected);
}

export function totalCollected(movements: readonly Money[], currency: string): Money {
  return movements.reduce<Money>((acc, m) => add(acc, m), { amount: 0, currency });
}
