/**
 * Máquinas de estado canónicas.
 *
 * Transcripción literal de `contracts/states.json`, que a su vez deriva de
 * `docs/01-product/requirements.md` §4. No añadir estados aquí sin actualizar
 * primero el contrato (regla 00-sources).
 */

export const EVENT_STATES = [
  'DRAFT',
  'READY',
  'ACTIVE',
  'IN_PROGRESS',
  'OPERATIONALLY_CLOSED',
  'FINANCIALLY_CLOSED',
  'ARCHIVED',
] as const;

export const REGISTRATION_STATES = ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'CANCELLED'] as const;

export const PAYMENT_COMPUTED_STATES = [
  'UNPAID',
  'PARTIAL',
  'PAID',
  'OVERPAID',
  'REFUNDED',
] as const;

export const ATTENDANCE_STATES = ['NOT_ARRIVED', 'CHECKED_IN', 'NO_SHOW', 'COMPLETED'] as const;

/**
 * Estado del registro `payments` (data-api-rbac.md §2).
 *
 * Distinto de `PAYMENT_COMPUTED_STATES`, que es el saldo derivado de la
 * inscripción. Un pago `SUCCEEDED` es inmutable: las correcciones se hacen por
 * reversión o anulación, nunca reescribiendo el registro (GOV-005, GOV-009).
 */
export const PAYMENT_STATES = [
  'PENDING',
  'SUCCEEDED',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;

export const PAYMENT_PROOF_STATES = [
  'PENDING_UPLOAD',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'CORRECTION_REQUESTED',
  'REPLACED',
  'CANCELLED',
] as const;

export const LODGING_STATES = ['HELD', 'CONFIRMED', 'RELEASED', 'CANCELLED', 'EXPIRED'] as const;

export type EventState = (typeof EVENT_STATES)[number];
export type RegistrationState = (typeof REGISTRATION_STATES)[number];
export type PaymentComputedState = (typeof PAYMENT_COMPUTED_STATES)[number];
export type AttendanceState = (typeof ATTENDANCE_STATES)[number];
export type PaymentState = (typeof PAYMENT_STATES)[number];
export type PaymentProofState = (typeof PAYMENT_PROOF_STATES)[number];
export type LodgingState = (typeof LODGING_STATES)[number];

/**
 * Transiciones permitidas del ciclo de gestión (requirements.md §4.1).
 *
 * `READY -> DRAFT` existe para corregir configuración. `ACTIVE ->
 * OPERATIONALLY_CLOSED` es un cierre anticipado que exige motivo (EVT-003).
 * No existe `REGISTRATION_CLOSED`.
 *
 * GOV-002: ninguna transición ocurre por fecha; todas son manuales y auditadas.
 */
export const EVENT_TRANSITIONS: Readonly<Record<EventState, readonly EventState[]>> = {
  DRAFT: ['READY'],
  READY: ['DRAFT', 'ACTIVE'],
  ACTIVE: ['IN_PROGRESS', 'OPERATIONALLY_CLOSED'],
  IN_PROGRESS: ['OPERATIONALLY_CLOSED'],
  OPERATIONALLY_CLOSED: ['FINANCIALLY_CLOSED'],
  FINANCIALLY_CLOSED: ['ARCHIVED'],
  ARCHIVED: [],
};

/**
 * Máquina de estados de la inscripción — `requirements.md` §4.2.
 *
 * Estaba declarada como lista de estados desde el origen, pero sin transiciones:
 * cualquier cambio era posible porque nada decía lo contrario.
 *
 * `CANCELLED` es terminal. GOV-005 exige que el histórico no se reescriba, así
 * que una inscripción cancelada no vuelve: si la persona se reincorpora, se
 * inscribe de nuevo y su cancelación anterior sigue siendo cierta.
 */
export const REGISTRATION_TRANSITIONS: Readonly<
  Record<RegistrationState, readonly RegistrationState[]>
> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
  CANCELLED: [],
};

export function canTransitionRegistration(from: RegistrationState, to: RegistrationState): boolean {
  return REGISTRATION_TRANSITIONS[from].includes(to);
}

/** Transiciones que no pueden ejecutarse sin un motivo registrado (EVT-003). */
const TRANSITIONS_REQUIRING_REASON: ReadonlySet<string> = new Set(['ACTIVE->OPERATIONALLY_CLOSED']);

export function canTransition(from: EventState, to: EventState): boolean {
  return EVENT_TRANSITIONS[from].includes(to);
}

export function requiresReason(from: EventState, to: EventState): boolean {
  return TRANSITIONS_REQUIRING_REASON.has(`${from}->${to}`);
}

/**
 * GOV-003: `ACTIVE` e `IN_PROGRESS` habilitan inscripciones y pagos.
 * GOV-004: solo `OPERATIONALLY_CLOSED` y posteriores bloquean la operación ordinaria.
 */
export function acceptsRegistrationsAndPayments(state: EventState): boolean {
  return state === 'ACTIVE' || state === 'IN_PROGRESS';
}

export function blocksOrdinaryOperations(state: EventState): boolean {
  return state === 'OPERATIONALLY_CLOSED' || state === 'FINANCIALLY_CLOSED' || state === 'ARCHIVED';
}
