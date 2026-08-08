export {
  assertConfirmable,
  decideConfirmation,
  shouldConfirm,
  type ConfirmationDecision,
  type ConfirmationInput,
} from './registration.js';

export {
  EVENT_STATES,
  REGISTRATION_STATES,
  PAYMENT_COMPUTED_STATES,
  ATTENDANCE_STATES,
  PAYMENT_STATES,
  PAYMENT_PROOF_STATES,
  LODGING_STATES,
  EVENT_TRANSITIONS,
  REGISTRATION_TRANSITIONS,
  canTransition,
  canTransitionRegistration,
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

export { civilDayAnchor, civilDayIn, todayAnchorIn } from './civil-date.js';

export { dayNumber, totalDays } from './event-duration.js';

export { MINIMUM_AGE, ageAt, assertEligibleByAge, isEligibleByAge } from './eligibility.js';

export {
  accountBalance,
  assertBalanced,
  entryDifference,
  isBalanced,
  isReconciled,
  reconciliationDifference,
  signedAmount,
  type AccountKind,
  type EntrySide,
  type JournalLine,
} from './accounting.js';

export {
  MAX_DELIVERY_ATTEMPTS,
  canTransitionNotification,
  nextRetryDelayMs,
  renderTemplate,
  shouldRetry,
  templateVariables,
  type NotificationState,
} from './notifications.js';

export {
  decideMaterialDelivery,
  decideMealDelivery,
  deliveryIdempotencyKey,
  hasServiceAvailability,
  isWithinServiceWindow,
  stockFromMovements,
  type DeliveryDecision,
  type DeliveryRejection,
  type InventoryMovement,
  type MealService,
  type MovementKind,
} from './benefits.js';

export {
  ADVANCE_CHANNELS,
  ARRIVAL_CHANNELS,
  EVIDENCE_CONTENT_TYPES,
  EVIDENCE_MAX_BYTES,
  RATE_SCALE,
  assertAllocationsWithinCharges,
  assertAllocationsWithinPayment,
  assertDeclarableEvidence,
  assertPayableAmount,
  canTransitionProof,
  cashDifference,
  computeBalance,
  convert,
  creditBalance,
  creditFromOverpayment,
  formatReceiptNumber,
  isReviewable,
  totalCollected,
  unallocatedAmount,
  type AdvanceChannel,
  type ArrivalChannel,
  type Balance,
  type BalanceInput,
  type ChargeAllocationInput,
  type DeclaredEvidence,
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
  authorizeOwnership,
  can,
  owns,
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
