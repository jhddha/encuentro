import { DomainError } from './errors.js';
import { meetsMinimumPercent, type Money } from './money.js';

/**
 * Modalidad, tarifa y cargo.
 *
 * DEC-002 separa dos conceptos que en lenguaje corriente se confunden:
 *
 *  - **Modalidad** (`PaymentMode`): anticipado o al llegar. Es una decisión
 *    comercial que fija el precio y los beneficios.
 *  - **Canal de pago**: QR Bolivia, cuenta de EE. UU., efectivo, QR en caja.
 *    Es el medio concreto por el que entra el dinero.
 *
 * Una persona puede elegir modalidad anticipada y pagar por cualquier canal
 * habilitado. Este módulo trata solo la modalidad; el canal vive en Billing.
 */

/** REG-019: el peregrino selecciona exactamente una. */
export type PaymentMode = 'ADVANCE' | 'ARRIVAL';

export type PackageVisibility = 'PUBLIC' | 'PRIVATE';

/**
 * Versión de precio.
 *
 * PKG-012: la tarifa anticipada y la normal son **montos explícitos**, no un
 * descuento calculado sobre la otra. Por eso aquí no existe ningún campo de
 * porcentaje de descuento: dos versiones independientes, cada una con su
 * importe.
 *
 * PKG-001: cambiar el precio crea una versión nueva; nunca altera los cargos
 * ya emitidos.
 */
export interface PriceVersion {
  readonly id: string;
  readonly packageId: string;
  readonly paymentMode: PaymentMode;
  readonly amount: Money;
  /** Vigencia de la tarifa. `ARRIVAL` normalmente no la lleva. */
  readonly startsAt?: Date;
  readonly endsAt?: Date;
  /** PKG-013: mínimo a pagar para desbloquear el beneficio. */
  readonly minPaymentPercent?: number;
  /** PKG-013: vencimiento del saldo restante. */
  readonly balanceDueAt?: Date;
}

/**
 * ¿Está vigente la tarifa anticipada en este instante?
 *
 * REG-021: lo que cuenta es **cuándo se cargó el comprobante**, no cuándo se
 * revisó. Una evidencia subida el último día del plazo conserva la tarifa
 * aunque Inscripciones la apruebe una semana después. Por eso esta función
 * recibe el momento de la carga y no el de la aprobación.
 */
export function isAdvanceRateAvailable(version: PriceVersion, uploadedAt: Date): boolean {
  if (version.paymentMode !== 'ADVANCE') return false;

  const afterStart = version.startsAt === undefined || uploadedAt >= version.startsAt;
  const beforeEnd = version.endsAt === undefined || uploadedAt <= version.endsAt;

  return afterStart && beforeEnd;
}

/**
 * ¿Desbloquea el pago aprobado el derecho a escoger hotel?
 *
 * REG-020 y HOS-016: hace falta tener aprobado al menos el mínimo configurado
 * (referencia actual, 50%). Lo que cuenta es el importe **aprobado**, no el
 * declarado: PAY-025 es explícito en que subir una evidencia no confirma nada.
 */
export function unlocksHotelSelection(version: PriceVersion, approvedAmount: Money): boolean {
  if (version.paymentMode !== 'ADVANCE') return false;

  const percent = version.minPaymentPercent;
  if (percent === undefined) {
    throw new DomainError(
      'ADVANCE_BENEFIT_NOT_UNLOCKED',
      'La versión de precio anticipada no define un mínimo de pago (PKG-013).',
    );
  }

  return meetsMinimumPercent(approvedAmount, version.amount, percent);
}

/**
 * Importe a cobrar por una inscripción.
 *
 * REG-023 y DEC-004: durante `IN_PROGRESS` **no se prorratea**. Llegar el día 1,
 * el día 3 o el último día cuesta lo mismo: el paquete completo.
 *
 * PKG-011: tampoco existen tarifas tardías automáticas. Si hace falta cobrar
 * distinto a quien llega tarde, se le asigna otro paquete previamente
 * configurado — una decisión humana y auditada, no un cálculo.
 *
 * De ahí que esta función no reciba ninguna fecha. No es un descuido: recibir
 * el día de llegada abriría la puerta a que alguien lo usara para ajustar el
 * importe, que es justo lo que las dos reglas prohíben.
 */
export function chargeAmount(version: PriceVersion): Money {
  return version.amount;
}

/**
 * ¿Puede este actor ver u ofrecer el paquete?
 *
 * PKG-009 y PKG-010: los paquetes `PRIVATE` no aparecen en el portal público y
 * solo los asigna quien tenga `catalog.private.assign`.
 */
export function isPackageOfferable(
  visibility: PackageVisibility,
  context: { readonly isPublicPortal: boolean; readonly canAssignPrivate: boolean },
): boolean {
  if (visibility === 'PUBLIC') return true;
  return !context.isPublicPortal && context.canAssignPrivate;
}

/**
 * Cargo congelado.
 *
 * PAY-001: al inscribirse se congelan paquete, versión de precio, moneda e
 * importe. El histórico es inmutable, así que un cambio posterior de tarifa no
 * altera lo ya cobrado (PKG-001).
 */
export interface ChargeSnapshot {
  readonly packageId: string;
  readonly priceVersionId: string;
  readonly paymentMode: PaymentMode;
  readonly amount: Money;
  readonly frozenAt: Date;
}

export function freezeCharge(version: PriceVersion, at: Date): ChargeSnapshot {
  return {
    packageId: version.packageId,
    priceVersionId: version.id,
    paymentMode: version.paymentMode,
    amount: chargeAmount(version),
    frozenAt: at,
  };
}
