/**
 * Catálogo de componentes.
 *
 * Los componentes ligados a datos (`PriceVersionEditor`, `PaymentProofUploader`,
 * `ProofReviewPanel`, `HotelAvailabilityPicker`, `LodgingPolicyForm`,
 * `MealServiceEditor`, `AuditTrail`) están enumerados en
 * `docs/03-design/design-system.md` §7 y se implementan en la fase que los
 * necesita. Aquí viven los transversales.
 *
 * Los tokens se importan aparte: `@encuentro/ui/tokens.css`.
 */

export { Button, type ButtonProps, type ButtonVariant } from './components/Button.js';
export { ReceiptVerificationResult } from './components/ReceiptVerificationResult.js';
export {
  PaymentModeCards,
  type PaymentMode,
  type PaymentModeOption,
} from './components/PaymentModeCards.js';
export { FORBIDDEN_PAYMENT_TERM, MICROCOPY } from './microcopy.js';
export { StatusBadge, type StatusBadgeProps, type StatusTone } from './components/StatusBadge.js';
export {
  EmptyState,
  ErrorState,
  LoadingState,
  ReadonlyState,
  SuccessState,
} from './components/states.js';
export {
  Card,
  PageHeader,
  ScrollableTable,
  SkipLink,
  VisuallyHidden,
  type PageHeaderProps,
} from './components/layout.js';
