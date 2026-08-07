import { shouldRelease } from '@encuentro/domain';

import type { Clock, ReservationRecord, ReservationRepository } from './ports.js';

/**
 * Expiración de retenciones `HELD` — DEC-005, HOS-012, HOS-003.
 *
 * Corre en el worker (DEC-001). Es el único mecanismo del sistema que cambia el
 * estado de una reserva sin que haya una persona detrás, y por eso es también
 * el que más cuidado necesita: liberar de más significa vender dos veces la
 * misma cama, y liberar lo que no toca significa quitarle la cama a alguien que
 * ya pagó.
 *
 * Tres salvaguardas, en orden de importancia:
 *
 *  1. **El estado se comprueba dos veces.** La base filtra por `status = 'HELD'`
 *     y el dominio lo vuelve a exigir con `shouldRelease`. HOS-012 dice que una
 *     reserva `CONFIRMED` no se libera nunca por este camino, ni siquiera
 *     porque la persona no haya llegado.
 *  2. **El vencimiento se comprueba dos veces, y por caminos distintos.** La
 *     base usa la columna `held_until`, calculada al crear la retención; el
 *     dominio recalcula desde `createdAt` con la duración de DEC-005. Solo se
 *     expira si **ambos** coinciden. Si discrepan, se cuenta y no se toca nada:
 *     una discrepancia significa que alguien escribió un `held_until` que no
 *     corresponde, y ante la duda no se libera.
 *  3. **La escritura es compare-and-swap.** Una confirmación que llegue en el
 *     mismo segundo gana la carrera y la expiración se retira.
 */

export interface ExpireHeldReservationsDeps {
  readonly reservations: ReservationRepository;
  readonly clock: Clock;
  /**
   * Actor al que se atribuyen las expiraciones en auditoría.
   *
   * La auditoría exige actor (GOV-006) y aquí no hay persona. Se usa la cuenta
   * de sistema creada por migración, no un valor nulo: un registro sin actor
   * rompería la trazabilidad de toda la tabla.
   */
  readonly systemActorId: string;
}

export interface ExpireHeldReservationsResult {
  /** Candidatas que la base consideró vencidas. */
  readonly examined: number;
  /** Expiradas efectivamente. */
  readonly expired: number;
  /** Perdieron el compare-and-swap: alguien las modificó antes. */
  readonly lost: number;
  /** La base las creía vencidas y el dominio no. No se tocaron. */
  readonly disagreed: number;
}

/** Cota por ejecución. Evita que un atasco produzca una transacción enorme. */
const BATCH_LIMIT = 200;

export async function expireHeldReservations(
  deps: ExpireHeldReservationsDeps,
  limit: number = BATCH_LIMIT,
): Promise<ExpireHeldReservationsResult> {
  const now = deps.clock.now();
  const candidates = await deps.reservations.findExpiryCandidates(now, limit);

  let expired = 0;
  let lost = 0;
  let disagreed = 0;

  for (const candidate of candidates) {
    if (!agreesWithDomain(candidate, now)) {
      disagreed += 1;
      continue;
    }

    const ok = await deps.reservations.expire({
      reservationId: candidate.id,
      expectedVersion: candidate.version,
      actorId: deps.systemActorId,
      reason: 'Retención vencida (DEC-005).',
    });

    if (ok) {
      expired += 1;
    } else {
      lost += 1;
    }
  }

  return { examined: candidates.length, expired, lost, disagreed };
}

/**
 * ¿Coinciden la columna y la regla?
 *
 * `shouldRelease` es la regla de DEC-005 aplicada sobre `createdAt`. `heldUntil`
 * es lo que se escribió al crear la retención. Exigir las dos convierte una
 * columna mal escrita en un candidato ignorado, no en una cama liberada por
 * error.
 */
function agreesWithDomain(reservation: ReservationRecord, now: Date): boolean {
  if (!shouldRelease(reservation.status, reservation.createdAt, now)) {
    return false;
  }

  if (reservation.heldUntil === null) {
    return false;
  }

  return now.getTime() >= reservation.heldUntil.getTime();
}
