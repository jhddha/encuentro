import { DomainError } from './errors.js';
import type { LodgingState } from './states.js';

/**
 * Hospedaje.
 *
 * Tres reglas gobiernan este módulo, y las tres van contra lo que un sistema de
 * reservas hace por costumbre:
 *
 *  - **HOS-011**: la cantidad de noches es fija y configurable por gestión. No
 *    se deriva de las fechas de llegada y salida de cada persona.
 *  - **HOS-013 y HOS-012**: llegar tarde **no** recorta el rango, **no** baja el
 *    precio y **no** libera la reserva. Un sistema de hotel corriente haría las
 *    tres cosas.
 *  - **DEC-005**: `HELD` expira a los 30 minutos, pero solo `HELD`.
 */

/**
 * Política de hospedaje de una gestión.
 *
 * `nightCount` es un dato configurado, no un cálculo. La referencia actual son
 * 7 noches, y ese número no aparece en el código.
 */
export interface LodgingPolicy {
  readonly eventId: string;
  readonly nightCount: number;
  readonly checkInDate: Date;
  readonly checkOutDate: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Comprueba que la política es coherente consigo misma.
 *
 * El número de noches entre entrada y salida debe coincidir con `nightCount`.
 * Si no coincide, alguien configuró mal la gestión y conviene saberlo al
 * guardar, no cuando el primer peregrino intente reservar.
 */
export function assertPolicyConsistent(policy: LodgingPolicy): void {
  if (policy.nightCount < 1) {
    throw new DomainError('LODGING_POLICY_INVALID', 'La política debe tener al menos una noche.');
  }

  const checkIn = Date.UTC(
    policy.checkInDate.getUTCFullYear(),
    policy.checkInDate.getUTCMonth(),
    policy.checkInDate.getUTCDate(),
  );
  const checkOut = Date.UTC(
    policy.checkOutDate.getUTCFullYear(),
    policy.checkOutDate.getUTCMonth(),
    policy.checkOutDate.getUTCDate(),
  );

  const nights = Math.round((checkOut - checkIn) / MS_PER_DAY);

  if (nights !== policy.nightCount) {
    throw new DomainError(
      'LODGING_POLICY_INVALID',
      `La política declara ${String(policy.nightCount)} noches pero sus fechas abarcan ${String(nights)}.`,
    );
  }
}

/**
 * Duración de una retención `HELD` — DEC-005.
 *
 * Treinta minutos. La retención cubre la **selección** de hotel, no la espera
 * de que alguien revise un pago: HOS-016 sitúa la elección **después** de la
 * aprobación, así que funciona como un carrito de compra.
 *
 * Si el flujo cambiara y el `HELD` pasara a cubrir una espera de revisión
 * humana, treinta minutos serían insuficientes y DEC-005 tendría que
 * revisarse. Queda dicho aquí porque es donde alguien lo leerá.
 */
export const HELD_DURATION_MS = 30 * 60 * 1000;

export function heldExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + HELD_DURATION_MS);
}

/**
 * ¿Debe liberarse esta reserva?
 *
 * Solo `HELD` expira. La regla completa es HOS-012 y DEC-004: una reserva
 * `CONFIRMED` **no se libera nunca** por este mecanismo, y en particular no se
 * libera porque la persona no haya llegado el primer día.
 *
 * La firma no recibe la fecha de llegada real a propósito: aceptarla invitaría
 * a usarla, y usarla sería exactamente la regla que HOS-012 prohíbe.
 */
export function shouldRelease(state: LodgingState, createdAt: Date, now: Date): boolean {
  if (state !== 'HELD') return false;
  return now.getTime() >= heldExpiresAt(createdAt).getTime();
}

/**
 * Efecto de la llegada real sobre la reserva.
 *
 * HOS-013: `actual_arrival_at` **no reescribe** la reserva. Se registra como
 * dato de asistencia y nada más: ni recorta noches, ni cambia el importe, ni
 * altera el estado.
 *
 * Esta función existe para dejarlo explícito en el código y para que haya algo
 * a lo que apuntar cuando alguien proponga «ajustar la reserva a la llegada
 * real».
 */
export function reservationAfterArrival(reservation: {
  readonly state: LodgingState;
  readonly nightCount: number;
}): { readonly state: LodgingState; readonly nightCount: number } {
  return reservation;
}

/**
 * Disponibilidad de un hotel.
 *
 * HOS-002: la capacidad se controla por inventario y rango, no por un contador
 * que pueda desincronizarse. Esta función decide sobre cifras ya leídas; la
 * atomicidad del último cupo la resuelve la base con un constraint, no aquí.
 */
export function hasAvailability(capacity: number, occupied: number): boolean {
  return occupied < capacity;
}

export function remainingCapacity(capacity: number, occupied: number): number {
  return Math.max(0, capacity - occupied);
}
