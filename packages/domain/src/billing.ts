import { todayAnchorIn } from './civil-date.js';
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
 * Tipos de archivo admitidos como evidencia — PAY-018.
 *
 * Una lista blanca, no negra. Servir un `text/html` desde una URL firmada del
 * mismo origen sería ejecutar HTML de un desconocido con la sesión del revisor
 * delante: exactamente un XSS almacenado. Un comprobante bancario es una imagen
 * o un PDF y nada más.
 *
 * Vive en el dominio y no en el almacén porque el mensaje de rechazo es para el
 * peregrino, y `ObjectStorageError` no llega hasta él: el traductor de acciones
 * solo convierte `DomainError`. La infraestructura vuelve a comprobarlo como
 * última barrera, para que un futuro llamador que se salte el caso de uso no
 * consiga escribir en el bucket lo que aquí se rechaza.
 */
export const EVIDENCE_CONTENT_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

/** 10 MB. Una foto de comprobante no pesa más, y el límite acota el abuso. */
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

/** Longitud máxima de la referencia bancaria. Ninguna entidad emite más. */
const REFERENCE_MAX_LENGTH = 64;

/**
 * Datos que el peregrino declara al cargar una evidencia — PAY-018.
 *
 * «Evidencia registra monto, moneda, fecha, banco/plataforma, referencia,
 * pagador y archivo privado». El banco o plataforma no es un campo libre: es el
 * canal (`PAY-023`, `PAY-024`), y de él sale la moneda en que se cobra.
 */
export interface DeclaredEvidence {
  readonly amount: Money;

  /**
   * Día civil en que se hizo la transferencia, no un instante.
   *
   * El banco dice «8 de agosto», no «8 de agosto a las 14:37:22Z». Quien llama
   * ancla el día a una hora fija para poder representarlo como `Date`.
   */
  readonly paidAt: Date;

  readonly reference: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  /** Moneda del canal por el que se transfirió. */
  readonly channelCurrency: string;
  /** Moneda base de la gestión, que es en la que están los cargos. */
  readonly eventCurrency: string;

  /** Zona horaria de la gestión, para resolver qué día es «hoy» (NFR-013). */
  readonly timezone: string;

  /** Instante actual. El día civil que le corresponde sale de `timezone`. */
  readonly now: Date;
}

/**
 * Comprueba que una evidencia declarada pueda aceptarse.
 *
 * Se ejecuta **antes** de guardar el archivo. Al revés, un rechazo dejaría un
 * objeto huérfano en el bucket por cada intento fallido, y nadie lo recogería.
 *
 * No decide nada sobre el dinero: aceptar la evidencia no confirma el pago
 * (PAY-025). Solo comprueba que lo declarado pueda ser cierto.
 */
export function assertDeclarableEvidence(evidence: DeclaredEvidence): void {
  // PAY-019. Cero tampoco: declarar que se pagó nada no es declarar un pago.
  assertPayableAmount(evidence.amount, 'El importe declarado');

  if (evidence.reference.trim().length === 0) {
    throw new DomainError(
      'PAYMENT_PROOF_NOT_SUBMITTABLE',
      'La referencia bancaria es obligatoria (PAY-018).',
    );
  }

  if (evidence.reference.trim().length > REFERENCE_MAX_LENGTH) {
    throw new DomainError(
      'PAYMENT_PROOF_NOT_SUBMITTABLE',
      `La referencia bancaria no puede superar ${String(REFERENCE_MAX_LENGTH)} caracteres.`,
    );
  }

  /*
   * Una transferencia con fecha futura no ha ocurrido. No es una regla de
   * negocio añadida sino la lectura literal de PAY-018: el campo es la fecha
   * **del pago**, y aceptar mañana permitiría reservar hoy contra dinero que
   * quizá nunca salga.
   *
   * Se comparan **días civiles de la gestión**, no instantes. Comparar contra
   * el reloj rechazaba como futuro el pago que un peregrino de La Paz declaraba
   * antes de las ocho de la mañana: su «hoy» empieza cuatro horas después que
   * el UTC, y el ancla del día caía por delante del instante actual.
   */
  if (evidence.paidAt.getTime() > todayAnchorIn(evidence.timezone, evidence.now).getTime()) {
    throw new DomainError(
      'PAYMENT_PROOF_NOT_SUBMITTABLE',
      'La fecha del pago no puede ser futura.',
    );
  }

  if (!EVIDENCE_CONTENT_TYPES.includes(evidence.contentType)) {
    throw new DomainError(
      'PAYMENT_PROOF_NOT_SUBMITTABLE',
      'El comprobante debe ser una imagen (JPEG, PNG o WebP) o un PDF.',
    );
  }

  if (evidence.sizeBytes <= 0) {
    throw new DomainError(
      'PAYMENT_PROOF_NOT_SUBMITTABLE',
      'El archivo del comprobante está vacío.',
    );
  }

  if (evidence.sizeBytes > EVIDENCE_MAX_BYTES) {
    throw new DomainError(
      'PAYMENT_PROOF_NOT_SUBMITTABLE',
      'El archivo del comprobante supera los 10 MB.',
    );
  }

  if (evidence.amount.currency !== evidence.channelCurrency) {
    throw new DomainError(
      'MONEY_CURRENCY_MISMATCH',
      `El canal cobra en ${evidence.channelCurrency} y el importe se declaró en ${evidence.amount.currency}.`,
    );
  }

  /*
   * Aquí es donde DEC-009 se queda sin suelo.
   *
   * La decisión dice que la tasa se congela al cargar la evidencia, y
   * `payment_proofs.exchange_rate_micros` existe para guardarla. Lo que **no**
   * existe es de dónde sacarla: no hay tasa configurada por gestión en ningún
   * sitio del esquema. Sin fuente, congelar significaría inventar un número, y
   * ese número acabaría en un comprobante emitido.
   *
   * Así que la rama multimoneda se detiene aquí, en voz alta, en vez de
   * atravesar el sistema y morir más tarde: el circuito de aprobación ya
   * lanzaría `MONEY_CURRENCY_MISMATCH` al repartir contra cargos en otra
   * moneda, pero lo haría después de que el peregrino creyera haber pagado.
   *
   * Registrado como TBD-001 en `docs/04-delivery/decision-register.md`.
   */
  if (evidence.channelCurrency !== evidence.eventCurrency) {
    throw new DomainError(
      'MONEY_CURRENCY_MISMATCH',
      `Este canal cobra en ${evidence.channelCurrency} y la gestión factura en ${evidence.eventCurrency}. No hay tasa de cambio configurada para convertir (DEC-009), así que el pago debe hacerse por un canal en ${evidence.eventCurrency}.`,
    );
  }
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
 * Saldo a favor acumulado de una inscripción — DEC-008.
 *
 * No se deduce de `computeBalance`, y conviene entender por qué. El saldo
 * pendiente compara **cargos contra asignaciones**, y una asignación nunca
 * puede superar el saldo del cargo al que se aplica (`PAY-020`). Por tanto ese
 * saldo no puede salir negativo, y el sobrepago no aparecería por ningún lado
 * si solo se mirase esa resta.
 *
 * El sobrepago vive en otro sitio: en la parte del **pago** que no se repartió.
 * Al aprobar una evidencia por más de lo que se debe, el excedente queda sin
 * asignar a propósito, en vez de forzarse contra un cargo que no lo debe. Esta
 * función lo recupera comparando lo cobrado con lo repartido.
 *
 * `creditFromOverpayment` cubre la otra forma del mismo concepto —un saldo ya
 * calculado que salió negativo— y ambas devuelven siempre cero o positivo.
 */
export function creditBalance(
  payments: readonly Money[],
  allocations: readonly Money[],
  currency: string,
): Money {
  const credit = subtract(sum(payments, currency), sum(allocations, currency));

  // Un crédito negativo significaría que se repartió más dinero del que entró,
  // y eso ya lo impide `assertAllocationsWithinPayment`. Si ocurriera, mostrar
  // el negativo mentiría menos que exhibirlo como deuda: se corta en cero y el
  // descuadre se ve en el arqueo, no en la pantalla del peregrino.
  return isNegative(credit) ? { amount: 0, currency } : credit;
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
 *
 * **Se agrupa por cargo antes de comparar**, y esa es la parte que faltaba.
 * Comprobando línea a línea, dos asignaciones de 210 a un cargo que debe 210
 * pasaban las dos —cada una cabía por separado— y entre ambas le aplicaban 420.
 * `assertAllocationsWithinPayment` tampoco lo veía: el total sí cabía en el
 * pago. El resultado era un cargo sobrepagado, un saldo negativo que la
 * inscripción presentaba como sobrepago que nadie hizo, y un saldo a favor que
 * desaparecía.
 *
 * La pantalla del revisor genera un campo por cargo y no puede producirlo, pero
 * la acción de servidor acepta el array que le manden y su endpoint es
 * invocable directamente.
 */
export function assertAllocationsWithinCharges(
  allocations: readonly ChargeAllocationInput[],
): void {
  const porCargo = new Map<string, { total: Money; outstanding: Money }>();

  for (const allocation of allocations) {
    assertPayableAmount(allocation.amount, `La asignación al cargo ${allocation.chargeId}`);

    const acumulado = porCargo.get(allocation.chargeId);

    porCargo.set(allocation.chargeId, {
      total: acumulado === undefined ? allocation.amount : add(acumulado.total, allocation.amount),
      /*
       * El saldo del cargo lo aporta quien llama y es el mismo para todas las
       * líneas del mismo cargo. Se conserva el primero: tomar el último daría
       * igual, y recalcularlo aquí sería inventarse un dato que no tenemos.
       */
      outstanding: acumulado?.outstanding ?? allocation.chargeOutstanding,
    });
  }

  for (const [chargeId, { total, outstanding }] of porCargo) {
    if (compare(total, outstanding) > 0) {
      throw new DomainError(
        'PAYMENT_OVER_ALLOCATED',
        `La asignación al cargo ${chargeId} supera su saldo pendiente (PAY-020).`,
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
