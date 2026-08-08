import {
  ADVANCE_CHANNELS,
  DomainError,
  acceptsRegistrationsAndPayments,
  assertDeclarableEvidence,
  authorizeOwnership,
  canTransitionProof,
  type Actor,
  type EventState,
  type Money,
  type PaymentProofState,
  type RegistrationState,
} from '@encuentro/domain';

import type { Clock } from './ports.js';

/**
 * Carga de una evidencia de pago por el propio peregrino — PAY-018, PAY-025.
 *
 * Es la mitad que faltaba del circuito de pagos. El revisor ya podía aprobar,
 * rechazar y pedir corrección; lo que no existía era la forma de que llegara
 * algo que revisar, y sin ella **nadie puede pagar por anticipado**.
 *
 * Tres cosas gobiernan este módulo:
 *
 *  1. **Cargar no confirma nada** (PAY-025). Aquí no se crea ningún pago, no se
 *     toca ningún cargo y no cambia el estado de la inscripción. Solo aparece
 *     una fila `SUBMITTED` esperando a una persona.
 *  2. **La autorización es titularidad, no permiso** (PAY-021). El peregrino no
 *     tiene asignaciones de rol; lo que le habilita es que la inscripción sea
 *     suya. Ver `authorizeOwnership`.
 *  3. **El archivo se guarda al final** y solo si todo lo demás vale. Guardarlo
 *     antes dejaría un objeto huérfano en el almacén por cada intento
 *     rechazado, y nadie los recogería.
 */

/** Archivo ya guardado en el almacén privado. */
export interface EvidenceFile {
  /** Clave opaca del objeto. Sin PII (regla 03-security-rbac). */
  readonly fileId: string;
  /** SHA-256 del contenido — PAY-018 exige checksum. */
  readonly checksum: string;
}

/** Contenido del comprobante, tal como llega del formulario. */
export interface EvidenceUpload {
  readonly body: Uint8Array;
  readonly contentType: string;
}

/**
 * Puerto del almacén privado.
 *
 * La aplicación no sabe que detrás hay S3 ni MinIO: solo que existe un sitio
 * donde el archivo queda guardado y del que vuelve una clave y una suma.
 */
export interface EvidenceStore {
  store(input: {
    readonly eventId: string;
    readonly body: Uint8Array;
    readonly contentType: string;
  }): Promise<EvidenceFile>;
}

/** Inscripción vista desde el circuito de pagos. */
export interface RegistrationForPayment {
  readonly id: string;
  readonly eventId: string;
  readonly eventStatus: EventState;
  /** Moneda base de la gestión: la de los cargos. */
  readonly eventCurrency: string;
  /** Zona de la gestión. Decide qué día es «hoy» al validar la fecha (NFR-013). */
  readonly eventTimezone: string;
  readonly status: RegistrationState;
  /** Cuenta de la persona inscrita, o `null` si se inscribió sin correo (IAM-012). */
  readonly ownerUserId: string | null;
}

/** Canal por el que se transfirió — PAY-023, PAY-024. */
export interface PaymentChannelRecord {
  readonly id: string;
  /** Nulo en un canal global; si no, la gestión a la que pertenece. */
  readonly eventId: string | null;
  readonly code: string;
  readonly currency: string;
  readonly active: boolean;
}

export interface SubmitProofInput {
  readonly eventId: string;
  readonly registrationId: string;
  readonly channelId: string;
  readonly amount: Money;
  readonly paidAt: Date;
  readonly reference: string;
  readonly payerName: string | null;
  readonly file: EvidenceFile;
  readonly actorId: string;
}

export interface ResubmitProofInput {
  readonly eventId: string;
  readonly proofId: string;
  readonly expectedVersion: number;
  readonly amount: Money;
  readonly paidAt: Date;
  readonly reference: string;
  readonly payerName: string | null;
  readonly file: EvidenceFile;
  readonly actorId: string;
}

/**
 * Resultado de escribir la evidencia.
 *
 * El duplicado no viaja como excepción desde la infraestructura porque quien
 * sabe traducirlo a PAY-027 es esta capa. La base tiene
 * `@@unique([event_id, reference])`, así que la carrera la resuelve el índice y
 * no una consulta previa: comprobar antes y escribir después deja una ventana
 * donde dos cargas simultáneas con la misma referencia pasan las dos.
 */
export type ProofWriteResult =
  | { readonly ok: true; readonly proofId: string }
  | { readonly ok: false; readonly reason: 'DUPLICATE_REFERENCE' | 'CONFLICT' };

/** Evidencia que el peregrino intenta corregir. */
export interface ProofForResubmission {
  readonly id: string;
  readonly eventId: string;
  readonly eventStatus: EventState;
  readonly eventCurrency: string;
  readonly eventTimezone: string;
  readonly registrationId: string;
  readonly ownerUserId: string | null;
  readonly status: PaymentProofState;
  readonly channelCurrency: string;
  readonly version: number;
}

export interface ProofSubmissionRepository {
  findRegistrationForPayment(registrationId: string): Promise<RegistrationForPayment | null>;
  findChannel(channelId: string): Promise<PaymentChannelRecord | null>;
  findForResubmission(proofId: string): Promise<ProofForResubmission | null>;

  /** Crea la evidencia en `SUBMITTED` y audita, en una sola transacción. */
  submit(input: SubmitProofInput): Promise<ProofWriteResult>;

  /**
   * Sustituye los datos y el archivo de una evidencia corregida y la devuelve a
   * `SUBMITTED`, con compare-and-swap sobre versión y estado.
   */
  resubmit(input: ResubmitProofInput): Promise<ProofWriteResult>;
}

export interface SubmitPaymentProofDeps {
  readonly proofs: ProofSubmissionRepository;
  readonly evidence: EvidenceStore;
  readonly clock: Clock;
}

export interface SubmitPaymentProofCommand {
  readonly eventId: string;
  readonly registrationId: string;
  readonly channelId: string;
  readonly amount: Money;
  readonly paidAt: Date;
  readonly reference: string;
  readonly payerName?: string;
  readonly upload: EvidenceUpload;
}

export interface ResubmitPaymentProofCommand {
  readonly eventId: string;
  readonly proofId: string;
  readonly expectedVersion: number;
  readonly amount: Money;
  readonly paidAt: Date;
  readonly reference: string;
  readonly payerName?: string;
  readonly upload: EvidenceUpload;
}

/**
 * Carga una evidencia nueva.
 *
 * Devuelve el identificador de la evidencia creada, que la pantalla usa para
 * confirmar al peregrino qué quedó registrado.
 */
export async function submitPaymentProof(
  deps: SubmitPaymentProofDeps,
  actor: Actor,
  command: SubmitPaymentProofCommand,
): Promise<string> {
  const registration = await deps.proofs.findRegistrationForPayment(command.registrationId);

  if (registration?.eventId !== command.eventId) {
    // Mismo mensaje que la falta de titularidad. Distinguir «no existe» de «no
    // es tuya» permitiría enumerar inscripciones ajenas por identificador.
    throw new DomainError('FORBIDDEN', 'La inscripción solicitada no está disponible.');
  }

  authorizeOwnership(actor, registration.ownerUserId);
  assertEventAcceptsPayments(registration.eventStatus);
  assertRegistrationAcceptsPayments(registration.status);

  const channel = await resolveChannel(deps, command.channelId, registration.eventId);

  assertDeclarableEvidence({
    amount: command.amount,
    paidAt: command.paidAt,
    reference: command.reference,
    contentType: command.upload.contentType,
    sizeBytes: command.upload.body.byteLength,
    channelCurrency: channel.currency,
    eventCurrency: registration.eventCurrency,
    timezone: registration.eventTimezone,
    now: deps.clock.now(),
  });

  const file = await deps.evidence.store({
    eventId: registration.eventId,
    body: command.upload.body,
    contentType: command.upload.contentType,
  });

  const result = await deps.proofs.submit({
    eventId: registration.eventId,
    registrationId: registration.id,
    channelId: channel.id,
    amount: command.amount,
    paidAt: command.paidAt,
    reference: command.reference.trim(),
    payerName: normalizeOptional(command.payerName),
    file,
    actorId: actor.userId,
  });

  return assertWritten(result);
}

/**
 * Corrige una evidencia a la que el revisor pidió corrección — PAY-026.
 *
 * Sin esto el circuito está cortado: el revisor puede pedir una corrección que
 * el peregrino no tiene forma de hacer, y la evidencia se queda en
 * `CORRECTION_REQUESTED` para siempre.
 *
 * Se corrige **la misma fila**, no se crea otra. La máquina de estados lo dice
 * así (`CORRECTION_REQUESTED -> SUBMITTED`) y hay una razón práctica detrás: la
 * referencia bancaria es única por gestión, así que volver a cargar el mismo
 * comprobante corregido como fila nueva chocaría contra el índice.
 */
export async function resubmitPaymentProof(
  deps: SubmitPaymentProofDeps,
  actor: Actor,
  command: ResubmitPaymentProofCommand,
): Promise<void> {
  const proof = await deps.proofs.findForResubmission(command.proofId);

  if (proof?.eventId !== command.eventId) {
    throw new DomainError('FORBIDDEN', 'La evidencia solicitada no está disponible.');
  }

  authorizeOwnership(actor, proof.ownerUserId);
  assertEventAcceptsPayments(proof.eventStatus);

  if (!canTransitionProof(proof.status, 'SUBMITTED')) {
    throw new DomainError(
      'PAYMENT_PROOF_NOT_SUBMITTABLE',
      `Una evidencia en ${proof.status} no admite corrección. Cargue una evidencia nueva.`,
    );
  }

  assertDeclarableEvidence({
    amount: command.amount,
    paidAt: command.paidAt,
    reference: command.reference,
    contentType: command.upload.contentType,
    sizeBytes: command.upload.body.byteLength,
    // El canal no cambia al corregir: si el peregrino pagó por otra vía, eso es
    // otro pago y por tanto otra evidencia, no una corrección de esta.
    channelCurrency: proof.channelCurrency,
    eventCurrency: proof.eventCurrency,
    timezone: proof.eventTimezone,
    now: deps.clock.now(),
  });

  const file = await deps.evidence.store({
    eventId: proof.eventId,
    body: command.upload.body,
    contentType: command.upload.contentType,
  });

  /*
   * El archivo anterior no se borra. GOV-009 no lo enumera, pero la razón es la
   * misma: la evidencia que el revisor vio cuando pidió la corrección forma
   * parte del rastro de por qué la pidió. Se sustituye la referencia, no el
   * histórico.
   */
  const result = await deps.proofs.resubmit({
    eventId: proof.eventId,
    proofId: proof.id,
    expectedVersion: command.expectedVersion,
    amount: command.amount,
    paidAt: command.paidAt,
    reference: command.reference.trim(),
    payerName: normalizeOptional(command.payerName),
    file,
    actorId: actor.userId,
  });

  assertWritten(result);
}

/**
 * GOV-003 y GOV-004.
 *
 * Una gestión cerrada no admite pagos. Comprobarlo aquí y no solo en la
 * revisión evita que alguien cargue un comprobante que jamás podrá aprobarse.
 */
function assertEventAcceptsPayments(status: EventState): void {
  if (!acceptsRegistrationsAndPayments(status)) {
    throw new DomainError(
      'EVENT_OPERATIONS_BLOCKED',
      `La gestión está en ${status} y no admite cargar evidencias de pago.`,
    );
  }
}

/**
 * Una inscripción cancelada no recibe dinero.
 *
 * DEC-007 es explícito en que cancelar no devuelve lo pagado, sino que lo deja
 * como saldo a favor. Aceptar dinero **nuevo** contra una inscripción cancelada
 * sería crear saldo a favor de algo que ya no existe, y la persona no lo
 * recuperaría: para volver hay que inscribirse de nuevo (REG-009).
 */
function assertRegistrationAcceptsPayments(status: RegistrationState): void {
  if (status === 'CANCELLED') {
    throw new DomainError(
      'PAYMENT_PROOF_NOT_SUBMITTABLE',
      'La inscripción está cancelada y no admite nuevos pagos (REG-009).',
    );
  }
}

async function resolveChannel(
  deps: SubmitPaymentProofDeps,
  channelId: string,
  eventId: string,
): Promise<PaymentChannelRecord> {
  const channel = await deps.proofs.findChannel(channelId);

  /*
   * Un canal de otra gestión no vale, aunque exista y esté activo. Sin esta
   * comprobación bastaría con presentar el identificador de un canal ajeno para
   * cobrar por una cuenta que esta gestión no controla.
   */
  if (channel === null || (channel.eventId !== null && channel.eventId !== eventId)) {
    throw new DomainError(
      'PAYMENT_PROOF_NOT_SUBMITTABLE',
      'El canal de pago indicado no está disponible en esta gestión.',
    );
  }

  // PAY-023 y PAY-024: los canales son configurables y se habilitan por
  // gestión. Uno deshabilitado dejó de admitir dinero, y aceptarlo dejaría una
  // transferencia hecha a una cuenta que ya nadie mira.
  if (!channel.active) {
    throw new DomainError(
      'PAYMENT_PROOF_NOT_SUBMITTABLE',
      `El canal ${channel.code} está deshabilitado en esta gestión.`,
    );
  }

  /*
   * PAY-024, y es la comprobación que más falta hacía.
   *
   * El efectivo y el QR en caja son de **caja**, y PAY-011 exige que todo cobro
   * presencial ocurra en una sesión de caja abierta. La pantalla ya solo ofrece
   * los tres canales anticipados, pero eso no es una garantía: el
   * identificador del canal viaja en el formulario, y el endpoint que Next
   * genera para la acción de servidor es invocable directamente.
   *
   * Sin esto, presentar el identificador de un canal `CASH` producía una
   * evidencia aprobable cuyo pago nunca pasaba por ningún arqueo: dinero que
   * baja el saldo del peregrino y que PAY-012 no puede contar.
   */
  if (!(ADVANCE_CHANNELS as readonly string[]).includes(channel.code)) {
    throw new DomainError(
      'PAYMENT_PROOF_NOT_SUBMITTABLE',
      `El canal ${channel.code} solo admite cobros en caja (PAY-024). Declare el pago por un canal anticipado.`,
    );
  }

  return channel;
}

function assertWritten(result: ProofWriteResult): string {
  if (result.ok) return result.proofId;

  if (result.reason === 'DUPLICATE_REFERENCE') {
    // PAY-027. La referencia identifica una transferencia concreta: repetirla
    // significa o un doble envío del formulario, o el intento de justificar dos
    // veces el mismo dinero.
    throw new DomainError(
      'PAYMENT_PROOF_DUPLICATE_REFERENCE',
      'Ya existe una evidencia con esa referencia en esta gestión (PAY-027).',
    );
  }

  throw new DomainError(
    'EVENT_VERSION_CONFLICT',
    'La evidencia cambió mientras preparaba esta operación. Vuelva a cargarla e inténtelo de nuevo.',
  );
}

function normalizeOptional(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
