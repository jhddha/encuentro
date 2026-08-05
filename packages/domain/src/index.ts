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

export { dayNumber, totalDays } from './event-duration.js';

export { MINIMUM_AGE, ageAt, assertEligibleByAge, isEligibleByAge } from './eligibility.js';

export {
  ADVANCE_CHANNELS,
  ARRIVAL_CHANNELS,
  RATE_SCALE,
  assertAllocationsWithinPayment,
  canTransitionProof,
  cashDifference,
  computeBalance,
  convert,
  creditFromOverpayment,
  formatReceiptNumber,
  isReviewable,
  totalCollected,
  unallocatedAmount,
  type AdvanceChannel,
  type ArrivalChannel,
  type Balance,
  type BalanceInput,
  type PaymentChannel,
} from './billing.js';

export {
  HELD_DURATION_MS,
  assertPolicyConsistent,
  hasAvailability,
  heldExpiresAt,
  remainingCapacity,
  reservationAfterArrival,
  shouldRelease,
  type LodgingPolicy,
} from './lodging.js';

export {
  add,
  compare,
  isNegative,
  isZero,
  meetsMinimumPercent,
  money,
  subtract,
  sum,
  toDecimalString,
  type Money,
} from './money.js';

export {
  chargeAmount,
  freezeCharge,
  isAdvanceRateAvailable,
  isPackageOfferable,
  unlocksHotelSelection,
  type ChargeSnapshot,
  type PackageVisibility,
  type PaymentMode,
  type PriceVersion,
} from './pricing.js';

export {
  authorize,
  can,
  scopeCovers,
  type Actor,
  type ResourceContext,
  type RoleAssignment,
  type Scope,
  type ScopeType,
} from './rbac.js';

export {
  PUBLIC_RECEIPT_FIELDS,
  toPublicReceiptVerification,
  type PublicReceiptStatus,
  type PublicReceiptVerification,
} from './receipt.js';
