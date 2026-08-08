import {
  DomainError,
  acceptsRegistrationsAndPayments,
  assertConfirmable,
  authorize,
  canTransitionRegistration,
  computeBalance,
  decideConfirmation,
  type Actor,
  type ConfirmationDecision,
  type EventState,
  type Money,
  type RegistrationState,
} from '@encuentro/domain';

/**
 * Confirmación de una inscripción — REG-017.
 *
 * Es el caso de uso que faltaba para que el flujo de inscripción cierre. El
 * dominio ya sabía calcular el saldo (`computeBalance`) y desde ahora sabe
 * decidir la confirmación (`decideConfirmation`), pero nadie orquestaba las dos
 * cosas contra la base.
 *
 * El saldo **no se recibe**: se calcula aquí a partir de los cargos y las
 * asignaciones. Aceptarlo como parámetro dejaría que el llamador declarara que
 * una inscripción está pagada, y PAY-002 es explícito en que el saldo se deriva
 * y nunca se edita a mano.
 */

export interface ConfirmRegistrationCommand {
  readonly eventId: string;
  readonly registrationId: string;
  /** Versión que vio quien pidió la confirmación, para el compare-and-swap. */
  readonly expectedVersion: number;
}

/** Inscripción con lo necesario para decidir, tal como la ve la aplicación. */
export interface RegistrationForConfirmation {
  readonly id: string;
  readonly eventId: string;
  readonly eventStatus: EventState;
  readonly status: RegistrationState;
  readonly currency: string;
  readonly charges: readonly Money[];
  readonly allocations: readonly Money[];
  readonly fullExemptionApproved: boolean;
  readonly version: number;
}

export interface ConfirmRegistrationInput {
  readonly registrationId: string;
  readonly expectedVersion: number;
  readonly actorId: string;
}

export interface RegistrationConfirmationRepository {
  findForConfirmation(registrationId: string): Promise<RegistrationForConfirmation | null>;

  /**
   * Aplica la transición a `CONFIRMED` con compare-and-swap y auditoría en la
   * misma transacción. Devuelve `false` si otra operación se adelantó.
   */
  confirm(input: ConfirmRegistrationInput): Promise<boolean>;
}

export interface ConfirmRegistrationDeps {
  readonly registrations: RegistrationConfirmationRepository;
}

/**
 * Consulta si una inscripción se puede confirmar, sin confirmarla.
 *
 * La bandeja de inscripciones necesita mostrar por qué alguien no está
 * confirmado, y eso no es un error: es información. Reutiliza exactamente la
 * misma regla que la confirmación, que es lo que REG-017 pide al exigir
 * «política única de dominio».
 */
export async function inspectConfirmation(
  deps: ConfirmRegistrationDeps,
  actor: Actor,
  command: Omit<ConfirmRegistrationCommand, 'expectedVersion'>,
): Promise<ConfirmationDecision> {
  const registration = await load(deps, actor, command, 'registration.read');
  return decideConfirmation({
    state: registration.status,
    outstanding: computeBalance({
      charges: registration.charges,
      allocations: registration.allocations,
      currency: registration.currency,
    }).outstanding,
    fullExemptionApproved: registration.fullExemptionApproved,
  });
}

export async function confirmRegistration(
  deps: ConfirmRegistrationDeps,
  actor: Actor,
  command: ConfirmRegistrationCommand,
): Promise<void> {
  const registration = await load(deps, actor, command, 'registration.update');

  /*
   * Otro camino llegó primero.
   *
   * `CONFIRMED` solo se alcanza desde `SUBMITTED`. Si la inscripción ya está
   * confirmada —porque la aprobación de un pago la confirmó mientras esta
   * pantalla estaba abierta— o si se canceló entretanto, `assertConfirmable`
   * lanzaría `REGISTRATION_TRANSITION_INVALID`, que describe un error de
   * programación y le diría a quien pulsó el botón «no existe transición de
   * CONFIRMED a CONFIRMED».
   *
   * No es un error de programación: es una carrera, y la respuesta útil es la
   * misma que da el compare-and-swap cuando pierde. Con dos caminos hacia el
   * mismo estado, perder es un resultado previsto.
   */
  if (!canTransitionRegistration(registration.status, 'CONFIRMED')) {
    throw new DomainError(
      'EVENT_VERSION_CONFLICT',
      'La inscripción cambió mientras preparaba esta operación. Vuelva a cargarla e inténtelo de nuevo.',
    );
  }

  const balance = computeBalance({
    charges: registration.charges,
    allocations: registration.allocations,
    currency: registration.currency,
  });

  // Lanza si queda saldo y no hay exención: aquí quedarse en SUBMITTED es un
  // rechazo, no un dato.
  assertConfirmable({
    state: registration.status,
    outstanding: balance.outstanding,
    fullExemptionApproved: registration.fullExemptionApproved,
  });

  const applied = await deps.registrations.confirm({
    registrationId: command.registrationId,
    expectedVersion: command.expectedVersion,
    actorId: actor.userId,
  });

  if (!applied) {
    throw new DomainError(
      'EVENT_VERSION_CONFLICT',
      'La inscripción cambió mientras preparaba esta operación. Vuelva a cargarla e inténtelo de nuevo.',
    );
  }
}

/**
 * Autoriza, carga y comprueba el estado de la gestión.
 *
 * El orden importa y es el mismo que en `transitionEvent`: autorización antes
 * de leer el recurso, porque decirle a quien no puede operar sobre esta gestión
 * si la inscripción existe ya revela información.
 */
async function load(
  deps: ConfirmRegistrationDeps,
  actor: Actor,
  command: Omit<ConfirmRegistrationCommand, 'expectedVersion'>,
  permission: 'registration.read' | 'registration.update',
): Promise<RegistrationForConfirmation> {
  authorize(actor, permission, { type: 'EVENT', eventId: command.eventId });

  const registration = await deps.registrations.findForConfirmation(command.registrationId);

  if (registration?.eventId !== command.eventId) {
    // Mismo código que la falta de permiso. Distinguir «no existe» de «no
    // puedes» permitiría enumerar inscripciones de otra gestión.
    throw new DomainError('FORBIDDEN', 'La inscripción solicitada no está disponible.');
  }

  /*
   * GOV-003 y GOV-004, en una sola pregunta al dominio.
   *
   * Confirmar una inscripción es una operación ordinaria, así que exige la
   * misma ventana que crearla: `ACTIVE` o `IN_PROGRESS`. Enumerar los estados
   * aquí habría duplicado la regla, y duplicarla es cómo acaban divergiendo.
   */
  if (!acceptsRegistrationsAndPayments(registration.eventStatus)) {
    throw new DomainError(
      'EVENT_OPERATIONS_BLOCKED',
      `La gestión está en ${registration.eventStatus} y no admite confirmaciones.`,
    );
  }

  return registration;
}
