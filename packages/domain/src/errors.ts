/**
 * Errores de dominio.
 *
 * Los códigos son los declarados en `docs/02-architecture/data-api-rbac.md` §5
 * y en los invariantes de `requirements.md` §3. No inventar códigos nuevos sin
 * actualizar antes esa documentación (regla 01-no-guessing).
 */

export type DomainErrorCode =
  | 'EVENT_CONTEXT_REQUIRED'
  | 'EVENT_TRANSITION_INVALID'
  | 'EVENT_TRANSITION_REASON_REQUIRED'
  | 'EVENT_OPERATIONS_BLOCKED'
  | 'EVENT_VERSION_CONFLICT'
  | 'EVENT_DATES_INVALID'
  | 'FORBIDDEN'
  | 'MONEY_INVALID'
  | 'MONEY_CURRENCY_MISMATCH'
  | 'MINOR_NOT_ALLOWED'
  | 'ADVANCE_RATE_EXPIRED'
  | 'ADVANCE_BENEFIT_NOT_UNLOCKED'
  | 'PRIVATE_PACKAGE_FORBIDDEN'
  | 'LODGING_POLICY_INVALID'
  | 'LODGING_CAPACITY_EXHAUSTED'
  | 'LODGING_NOT_ELIGIBLE'
  | 'RECEIPT_SEQUENCE_INVALID'
  | 'PAYMENT_OVER_ALLOCATED'
  | 'PAYMENT_PROOF_NOT_REVIEWABLE'
  | 'PAYMENT_PROOF_NOT_SUBMITTABLE'
  | 'PAYMENT_PROOF_DUPLICATE_REFERENCE'
  | 'CASH_SESSION_REQUIRED'
  | 'DELIVERY_IDEMPOTENCY_INVALID'
  | 'MEAL_SERVICE_OUTSIDE_WINDOW'
  | 'MEAL_SERVICE_CAPACITY_EXHAUSTED'
  | 'ACCOUNTING_ENTRY_UNBALANCED'
  | 'ACCOUNTING_PERIOD_CLOSED'
  | 'NOTIFICATION_TEMPLATE_INVALID'
  | 'REGISTRATION_TRANSITION_INVALID'
  | 'REGISTRATION_NOT_CONFIRMABLE';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
