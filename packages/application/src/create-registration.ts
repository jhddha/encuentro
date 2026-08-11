import {
  DomainError,
  acceptsRegistrationsAndPayments,
  assertEligibleByAge,
  freezeCharge,
  isPackageOfferable,
  type Actor,
  type ChargeSnapshot,
  type EventState,
  type PackageVisibility,
  type PriceVersion,
} from '@encuentro/domain';

/**
 * Alta de una inscripción.
 *
 * Reúne cinco reglas que viven en documentos distintos, y el orden en que se
 * comprueban importa tanto como las reglas mismas.
 */
export interface CreateRegistrationCommand {
  readonly eventId: string;
  readonly personId: string;
  readonly birthDate: Date;
  readonly packageId: string;
  readonly priceVersionId: string;
  /** `true` cuando la petición viene del portal público, no de Inscripciones. */
  readonly fromPublicPortal: boolean;
}

export interface RegistrationContext {
  readonly eventStatus: EventState;
  readonly eventStartAt: Date;
  readonly packageVisibility: PackageVisibility;
  readonly priceVersion: PriceVersion;
  /** Inscripción previa de esta persona en esta gestión, si existe. */
  readonly hasExistingRegistration: boolean;
}

export interface RegistrationDraft {
  readonly eventId: string;
  readonly personId: string;
  readonly packageId: string;
  readonly priceVersionId: string;
  readonly charge: ChargeSnapshot;
}

/**
 * Valida y prepara una inscripción.
 *
 * Pura: no escribe. La persistencia la hace el repositorio, que además impone
 * la unicidad persona/gestión con un índice — comprobarla aquí no basta contra
 * dos peticiones simultáneas.
 */
export function prepareRegistration(
  actor: Actor | null,
  command: CreateRegistrationCommand,
  context: RegistrationContext,
  now: Date,
): RegistrationDraft {
  // 1. Estado de la gestión. GOV-003: solo ACTIVE e IN_PROGRESS admiten
  //    inscripciones; GOV-004: desde OPERATIONALLY_CLOSED se bloquea.
  if (!acceptsRegistrationsAndPayments(context.eventStatus)) {
    throw new DomainError(
      'EVENT_OPERATIONS_BLOCKED',
      `La gestión está en ${context.eventStatus} y no admite inscripciones.`,
    );
  }

  // 2. Edad. DEC-006 no admite menores, y se evalúa contra el inicio del
  //    evento: quien cumple 18 antes de que empiece sí puede asistir.
  assertEligibleByAge(command.birthDate, context.eventStartAt);

  // 3. Visibilidad del paquete. PKG-009 y PKG-010: los privados no se ofrecen
  //    en el portal y solo los asigna quien tiene `catalog.private.assign`.
  const canAssignPrivate =
    actor?.assignments.some(
      (a) =>
        a.permissions.includes('catalog.private.assign') &&
        (a.scope.type === 'GLOBAL' ||
          ('eventId' in a.scope && a.scope.eventId === command.eventId)),
    ) ?? false;

  if (
    !isPackageOfferable(context.packageVisibility, {
      isPublicPortal: command.fromPublicPortal,
      canAssignPrivate,
    })
  ) {
    throw new DomainError(
      'PRIVATE_PACKAGE_FORBIDDEN',
      'El paquete solicitado no está disponible para esta operación.',
    );
  }

  // 4. Coherencia entre versión de precio y paquete. La base también lo impone
  //    con una clave foránea compuesta, pero fallar aquí da un error de dominio
  //    legible en vez de una violación de constraint.
  if (context.priceVersion.packageId !== command.packageId) {
    throw new DomainError(
      'EVENT_CONTEXT_REQUIRED',
      'La versión de precio no pertenece al paquete indicado.',
    );
  }

  /*
   * 5. Una persona, una inscripción por gestión — IAM-002.
   *
   * «Una persona puede participar en varias gestiones sin duplicar la cuenta.
   * Existe una inscripción por gestión y persona.» Citaba PAY-001 y GOV-001, que
   * hablan del cargo congelado y del contexto de gestión: ninguno dice esto, y
   * quien buscara por IAM-002 no habría encontrado el único sitio donde se
   * aplica.
   *
   * La base lo impone además con `@@unique([eventId, personId])`. Esta
   * comprobación existe para dar un mensaje en vez de una violación de índice.
   */
  if (context.hasExistingRegistration) {
    throw new DomainError(
      'EVENT_CONTEXT_REQUIRED',
      'Esta persona ya tiene una inscripción en esta gestión.',
    );
  }

  return {
    eventId: command.eventId,
    personId: command.personId,
    packageId: command.packageId,
    priceVersionId: command.priceVersionId,
    // PAY-001: el cargo congela paquete, versión, modalidad e importe.
    charge: freezeCharge(context.priceVersion, now),
  };
}

/**
 * Código visible de inscripción.
 *
 * Formato `{EVENT_CODE}-{NNNNNN}`. La secuencia la asigna la base dentro de la
 * transacción; aquí solo se da forma, igual que hará el comprobante en P07.
 */
export function formatRegistrationCode(eventCode: string, sequence: number): string {
  return `${eventCode}-${String(sequence).padStart(6, '0')}`;
}
