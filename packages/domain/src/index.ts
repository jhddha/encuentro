export {
  EVENT_STATES,
  REGISTRATION_STATES,
  PAYMENT_COMPUTED_STATES,
  ATTENDANCE_STATES,
  PAYMENT_STATES,
  PAYMENT_PROOF_STATES,
  LODGING_STATES,
  EVENT_TRANSITIONS,
  canTransition,
  requiresReason,
  acceptsRegistrationsAndPayments,
  blocksOrdinaryOperations,
  type EventState,
  type RegistrationState,
  type PaymentComputedState,
  type AttendanceState,
  type PaymentState,
  type PaymentProofState,
  type LodgingState,
} from './states.js';

export { DomainError, type DomainErrorCode } from './errors.js';
