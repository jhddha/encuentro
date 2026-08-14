import {
  DomainError,
  acceptsRegistrationsAndPayments,
  assertAllocationsInCurrency,
  assertAllocationsWithinCharges,
  assertAllocationsWithinPayment,
  assertPayableAmount,
  authorize,
  canTransitionProof,
  requireBookedAmount,
  unallocatedAmount,
  type Actor,
  type EventState,
  type Money,
  type PaymentProofState,
} from '@encuentro/domain';

/**
 * Revisión de una evidencia de pago — PAY-025, PAY-026, PAY-027.
 *
 * Es la operación que **mueve dinero** en v1. DEC-002 y DEC-015 dejaron el
 * sistema sin checkout automático a propósito: nadie confirma un pago salvo una
 * persona autorizada mirando un comprobante bancario. Por eso todo lo que ocurre
 * aquí es irreversible por diseño —un pago aprobado no se edita (GOV-009), se
 * anula (PAY-033)— y por eso el orden de las comprobaciones importa.
 *
 * La revisión son **dos operaciones, no una**. `SUBMITTED` no puede ir directo a
 * `APPROVED`: la máquina de estados exige pasar por `UNDER_REVIEW`. No es
 * burocracia, es lo que impide que dos revisores trabajen la misma evidencia y
 * aprueben dos veces el mismo comprobante.
 */

export type ReviewOutcome = 'APPROVED' | 'REJECTED' | 'CORRECTION_REQUESTED';

/** Saldo pendiente de un cargo de la inscripción. */
export interface ChargeBalance {
  readonly chargeId: string;
  readonly outstanding: Money;
}

export interface ProofForReview {
  readonly id: string;
  readonly eventId: string;
  readonly eventStatus: EventState;
  readonly registrationId: string;
  readonly status: PaymentProofState;

  /**
   * Lo que el peregrino declara haber transferido, **en la moneda del canal**.
   *
   * No es lo que entra en los libros cuando el canal cobra en otra divisa. Se
   * llamaba `amount` y se usaba directamente como importe del pago; el nombre
   * ocultaba que faltaba convertirlo. Ver `requireBookedAmount`.
   */
  readonly declared: Money;

  /** Moneda funcional de los libros: la de la gestión. */
  readonly bookCurrency: string;

  /**
   * Tasa congelada al cargar la evidencia — DEC-009.
   *
   * `null` cuando el canal cobra en la moneda de la gestión, y también en una
   * evidencia multimoneda que se cargó antes de que existiera el registro de
   * tasas. El segundo caso no es aprobable: ver `requireBookedAmount`.
   *
   * No se recalcula al aprobar. La organización absorbe el movimiento cambiario
   * entre la carga y la revisión, que es la consecuencia que DEC-009 aceptó
   * explícitamente.
   */
  readonly exchangeRateMicros: number | null;

  readonly charges: readonly ChargeBalance[];

  /** PAY-027: la referencia ya existe en otra evidencia de la gestión. */
  readonly duplicateReference: boolean;

  readonly version: number;
}

export interface AllocationRequest {
  readonly chargeId: string;
  readonly amount: Money;
}

export interface TakeForReviewCommand {
  readonly eventId: string;
  readonly proofId: string;
  readonly expectedVersion: number;
}

export interface ReviewPaymentProofCommand {
  readonly eventId: string;
  readonly proofId: string;
  readonly expectedVersion: number;
  readonly outcome: ReviewOutcome;
  /** Obligatorio salvo al aprobar (PAY-026). */
  readonly reason?: string;
  /** Solo al aprobar: reparto del pago entre cargos. */
  readonly allocations?: readonly AllocationRequest[];
}

export interface ApproveProofInput {
  readonly proofId: string;
  readonly expectedVersion: number;
  readonly registrationId: string;

  /**
   * Importe con el que el pago entra en los libros, ya convertido.
   *
   * Es lo que baja el saldo, lo que cuenta el arqueo y lo que se reparte entre
   * cargos. Siempre en la moneda de la gestión.
   */
  readonly amount: Money;

  /**
   * Lo transferido tal cual, en la moneda del canal.
   *
   * Viaja junto al convertido para que el comprobante pueda decir las dos
   * cifras. Un comprobante que solo dijera «348.00 BOB» a quien transfirió
   * cincuenta dólares no se parece a nada que esa persona pueda reconocer, y
   * PAY-030 lo hace inmutable: lo que no se guarde al emitirlo no se añade
   * después.
   */
  readonly declared: Money;

  /** Tasa con la que se convirtió, o `null` si no hubo conversión. */
  readonly exchangeRateMicros: number | null;

  readonly allocations: readonly AllocationRequest[];
  /** Excedente sin asignar; queda como saldo a favor (DEC-008). */
  readonly credit: Money;
  readonly actorId: string;
}

export interface RecordReviewInput {
  readonly proofId: string;
  readonly expectedVersion: number;
  readonly outcome: Exclude<ReviewOutcome, 'APPROVED'>;
  readonly reason: string;
  readonly actorId: string;
}

/**
 * Comprobante recién emitido — PAY-031, DEC-003.
 *
 * `verificationToken` es el **valor en claro**, y esta respuesta es el único
 * momento de su vida en que existe fuera del QR. La base guarda solo su HMAC y
 * no puede devolverlo: si esta respuesta se descarta, el comprobante queda
 * emitido y ya nunca podrá verificarse.
 *
 * Eso es exactamente lo que ocurría: `approve` devolvía un booleano, el token se
 * generaba dentro de la transacción y moría con ella. Cada comprobante emitido
 * nacía inverificable, y no era recuperable ni siquiera con acceso a la base.
 */
export interface IssuedReceipt {
  readonly number: string;
  readonly verificationToken: string;
}

export interface PaymentProofRepository {
  findForReview(proofId: string): Promise<ProofForReview | null>;

  /** `SUBMITTED` → `UNDER_REVIEW`, con compare-and-swap. */
  takeForReview(input: {
    readonly proofId: string;
    readonly expectedVersion: number;
    readonly actorId: string;
  }): Promise<boolean>;

  /**
   * Aprueba en una sola transacción: mueve la evidencia a `APPROVED`, crea el
   * pago, escribe las asignaciones, emite el comprobante numerado y audita.
   *
   * Todo junto o nada. Un pago sin comprobante, o un comprobante sin
   * asignaciones, dejaría la contabilidad y el estado de cuenta mintiendo cada
   * uno por su lado.
   *
   * Devuelve el comprobante emitido, o `null` si otra operación se adelantó.
   */
  approve(input: ApproveProofInput): Promise<IssuedReceipt | null>;

  /** Rechazo o petición de corrección, con motivo y auditoría. */
  recordReview(input: RecordReviewInput): Promise<boolean>;
}

export interface ReviewPaymentProofDeps {
  readonly proofs: PaymentProofRepository;
}

/**
 * Toma una evidencia para revisarla.
 *
 * Separada de la decisión a propósito: deja constancia de quién la tomó y, con
 * el compare-and-swap, impide que un segundo revisor la tome a la vez.
 */
export async function takeProofForReview(
  deps: ReviewPaymentProofDeps,
  actor: Actor,
  command: TakeForReviewCommand,
): Promise<void> {
  const proof = await load(deps, actor, command.eventId, command.proofId);

  if (!canTransitionProof(proof.status, 'UNDER_REVIEW')) {
    throw new DomainError(
      'PAYMENT_PROOF_NOT_REVIEWABLE',
      `Una evidencia en ${proof.status} no puede tomarse para revisión.`,
    );
  }

  await assertApplied(
    deps.proofs.takeForReview({
      proofId: command.proofId,
      expectedVersion: command.expectedVersion,
      actorId: actor.userId,
    }),
  );
}

/**
 * Aplica la decisión del revisor.
 *
 * Devuelve el comprobante emitido cuando la decisión es aprobar, y `null` en
 * los otros dos casos. **Quien llame debe hacer algo con él**: contiene el
 * único ejemplar del token en claro que existirá nunca.
 */
export async function reviewPaymentProof(
  deps: ReviewPaymentProofDeps,
  actor: Actor,
  command: ReviewPaymentProofCommand,
): Promise<IssuedReceipt | null> {
  const proof = await load(deps, actor, command.eventId, command.proofId);

  if (!canTransitionProof(proof.status, command.outcome)) {
    throw new DomainError(
      'PAYMENT_PROOF_NOT_REVIEWABLE',
      `No existe transición de ${proof.status} a ${command.outcome}. Tome la evidencia para revisión primero.`,
    );
  }

  if (command.outcome !== 'APPROVED') {
    // PAY-026: la revisión registra resultado **y motivo**. Un rechazo sin
    // motivo deja al peregrino sin saber qué corregir.
    if (!hasText(command.reason)) {
      throw new DomainError(
        'PAYMENT_PROOF_NOT_REVIEWABLE',
        'Rechazar o pedir corrección exige un motivo registrado (PAY-026).',
      );
    }

    await assertApplied(
      deps.proofs.recordReview({
        proofId: command.proofId,
        expectedVersion: command.expectedVersion,
        outcome: command.outcome,
        reason: command.reason,
        actorId: actor.userId,
      }),
    );
    return null;
  }

  return await approve(deps, actor, command, proof);
}

async function approve(
  deps: ReviewPaymentProofDeps,
  actor: Actor,
  command: ReviewPaymentProofCommand,
  proof: ProofForReview,
): Promise<IssuedReceipt> {
  /*
   * PAY-027 antes que nada. Aprobar dos veces el mismo comprobante bancario
   * duplica un ingreso que nunca entró, y eso no se detecta hasta el arqueo.
   */
  if (proof.duplicateReference) {
    throw new DomainError(
      'PAYMENT_PROOF_DUPLICATE_REFERENCE',
      'La referencia de esta evidencia ya existe en la gestión (PAY-027).',
    );
  }

  assertPayableAmount(proof.declared, 'El importe declarado en la evidencia');

  /*
   * Aquí es donde el dinero cambia de moneda, y es el único sitio donde ocurre.
   *
   * A partir de esta línea nada vuelve a mirar lo declarado: el reparto, el
   * excedente, el pago y el saldo se calculan sobre el importe contabilizado.
   * Mezclar los dos es lo que hacía que cincuenta dólares se convirtieran en
   * cincuenta bolivianos sin que nada fallara.
   *
   * La tasa es la que se congeló al cargar (DEC-009), no la de hoy. Si la
   * cotización se movió entre la carga y esta revisión, la diferencia la absorbe
   * la organización: es la consecuencia que la decisión aceptó a cambio de que
   * el peregrino sepa cuánto debe en el momento en que paga.
   */
  const amount = requireBookedAmount({
    declared: proof.declared,
    bookCurrency: proof.bookCurrency,
    rateMicros: proof.exchangeRateMicros,
  });

  const allocations = command.allocations ?? [];
  const amounts = allocations.map((allocation) => allocation.amount);

  // El reparto se anota en la moneda de los libros. Comprobarlo antes que nada
  // convierte un «no se pueden operar USD y BOB» en algo accionable.
  assertAllocationsInCurrency(amounts, proof.bookCurrency);

  // PAY-020, las dos mitades: ni más de lo que entró, ni más de lo que se debe.
  assertAllocationsWithinPayment(amount, amounts);
  assertAllocationsWithinCharges(
    allocations.map((allocation) => ({
      chargeId: allocation.chargeId,
      amount: allocation.amount,
      chargeOutstanding: outstandingOf(proof, allocation.chargeId),
    })),
  );

  /*
   * El excedente no es un error. DEC-008: lo que sobra queda como saldo a favor
   * de la persona, no se devuelve ni se fuerza contra un cargo que no lo debe.
   */
  const credit = unallocatedAmount(amount, amounts);

  const receipt = await deps.proofs.approve({
    proofId: command.proofId,
    expectedVersion: command.expectedVersion,
    registrationId: proof.registrationId,
    amount,
    declared: proof.declared,
    exchangeRateMicros: proof.exchangeRateMicros,
    allocations,
    credit,
    actorId: actor.userId,
  });

  if (receipt === null) {
    throw new DomainError(
      'EVENT_VERSION_CONFLICT',
      'La evidencia cambió mientras preparaba esta operación. Vuelva a cargarla e inténtelo de nuevo.',
    );
  }

  return receipt;
}

function outstandingOf(proof: ProofForReview, chargeId: string): Money {
  const charge = proof.charges.find((candidate) => candidate.chargeId === chargeId);

  if (charge === undefined) {
    // Un cargo de otra inscripción, o inexistente. PAY-021 prohíbe la asignación
    // transversal silenciosa, así que esto se rechaza en vez de ignorarse.
    throw new DomainError(
      'PAYMENT_OVER_ALLOCATED',
      `El cargo ${chargeId} no pertenece a la inscripción de esta evidencia (PAY-021).`,
    );
  }

  return charge.outstanding;
}

async function load(
  deps: ReviewPaymentProofDeps,
  actor: Actor,
  eventId: string,
  proofId: string,
): Promise<ProofForReview> {
  authorize(actor, 'payment.proof.review', { type: 'EVENT', eventId });

  const proof = await deps.proofs.findForReview(proofId);

  if (proof?.eventId !== eventId) {
    throw new DomainError('FORBIDDEN', 'La evidencia solicitada no está disponible.');
  }

  if (!acceptsRegistrationsAndPayments(proof.eventStatus)) {
    throw new DomainError(
      'EVENT_OPERATIONS_BLOCKED',
      `La gestión está en ${proof.eventStatus} y no admite revisión de pagos.`,
    );
  }

  return proof;
}

async function assertApplied(applied: Promise<boolean>): Promise<void> {
  if (!(await applied)) {
    throw new DomainError(
      'EVENT_VERSION_CONFLICT',
      'La evidencia cambió mientras preparaba esta operación. Vuelva a cargarla e inténtelo de nuevo.',
    );
  }
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}
