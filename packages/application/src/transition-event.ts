import {
  authorize,
  canTransition,
  DomainError,
  requiresReason,
  type Actor,
  type EventState,
} from '@encuentro/domain';

import type { EventRecord, EventRepository } from './ports.js';

/**
 * Transición del ciclo de una gestión.
 *
 * EVT-003: manual, transaccional y auditada, con actor, motivo, versión y fecha.
 * GOV-002: ninguna fecha dispara una transición por su cuenta.
 * GOV-006: se valida permiso, scope, estado y versión antes de escribir.
 *
 * El orden de las comprobaciones no es casual. Autorización primero: a quien no
 * puede operar sobre esta gestión no se le dice si la transición sería válida,
 * porque eso ya revela información sobre su estado.
 */
export interface TransitionEventCommand {
  readonly eventId: string;
  readonly to: EventState;
  readonly expectedVersion: number;
  readonly reason?: string;
}

export interface TransitionEventDeps {
  readonly events: EventRepository;
}

export async function transitionEvent(
  deps: TransitionEventDeps,
  actor: Actor,
  command: TransitionEventCommand,
): Promise<EventRecord> {
  // 1. Autorización, antes de leer nada del recurso.
  authorize(actor, 'event.transition', { type: 'EVENT', eventId: command.eventId });

  const event = await deps.events.findById(command.eventId);
  if (event === null) {
    // Mismo código que la falta de permiso: quien está autorizado sobre esta
    // gestión ya sabe que existe, y quien no, no debe averiguarlo por aquí.
    throw new DomainError('FORBIDDEN', 'La gestión solicitada no está disponible.');
  }

  // 2. Legalidad de la transición según la máquina de estados canónica.
  if (!canTransition(event.status, command.to)) {
    throw new DomainError(
      'EVENT_TRANSITION_INVALID',
      `No existe transición de ${event.status} a ${command.to}.`,
    );
  }

  // 3. Motivo obligatorio en el cierre anticipado (EVT-003).
  if (requiresReason(event.status, command.to) && !hasText(command.reason)) {
    throw new DomainError(
      'EVENT_TRANSITION_REASON_REQUIRED',
      `La transición de ${event.status} a ${command.to} exige un motivo registrado.`,
    );
  }

  // 4. Cierre operativo: exige permiso propio además del de transición (EVT-009).
  if (command.to === 'OPERATIONALLY_CLOSED') {
    authorize(actor, 'event.close', { type: 'EVENT', eventId: command.eventId });
  }

  // 5. Compare-and-swap. La versión esperada la trae quien vio el estado, no la
  //    leemos aquí: usar `event.version` recién leída anularía el control de
  //    concurrencia, porque siempre coincidiría consigo misma.
  const updated = await deps.events.applyTransition({
    eventId: command.eventId,
    expectedVersion: command.expectedVersion,
    to: command.to,
    actorId: actor.userId,
    ...(hasText(command.reason) ? { reason: command.reason } : {}),
  });

  if (updated === null) {
    throw new DomainError(
      'EVENT_VERSION_CONFLICT',
      'La gestión cambió mientras preparaba esta operación. Vuelva a cargarla e inténtelo de nuevo.',
    );
  }

  return updated;
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}
