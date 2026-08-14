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

/**
 * Transiciones de una reserva.
 *
 * `HELD` es la elección del peregrino y `CONFIRMED` la asignación de Hospedaje
 * (HOS-015). Lo importante no es lo que se permite sino lo que no:
 *
 *  - **`CONFIRMED` no vuelve a `HELD`.** Cambiar de habitación no rebaja el
 *    estado: HOS-005 lo resuelve como una escritura sobre la misma reserva
 *    confirmada, no como un ciclo de liberar y volver a retener;
 *  - **`CONFIRMED` no va a `EXPIRED`.** HOS-012, y el worker ya lo respeta;
 *    tenerlo también aquí impide que un camino futuro lo intente;
 *  - los tres estados finales no salen de sí mismos. Volver a hospedar a
 *    alguien cuya reserva se liberó es una reserva nueva, no la resurrección de
 *    la vieja: la anterior es parte del histórico de por qué se liberó.
 */
const RESERVATION_TRANSITIONS: Readonly<Record<LodgingState, readonly LodgingState[]>> = {
  HELD: ['CONFIRMED', 'RELEASED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['RELEASED', 'CANCELLED'],
  RELEASED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransitionReservation(from: LodgingState, to: LodgingState): boolean {
  return RESERVATION_TRANSITIONS[from].includes(to);
}

/**
 * Fechas y noches de una reserva, tomadas de la política.
 *
 * HOS-011: la cantidad de noches es un dato configurado por gestión, **no** se
 * deriva de cuándo llega o se va cada persona. Y HOS-014 pide una sola fuente
 * versionada: esta función es la única forma de que una reserva obtenga sus
 * fechas, así que no puede haber dos valores en conflicto.
 *
 * Se valida la política antes de copiarla. Una gestión mal configurada tiene
 * que fallar al reservar la primera cama y no producir reservas incoherentes
 * que alguien descubra al cerrar el evento.
 */
export function reservationDatesFrom(policy: LodgingPolicy): {
  readonly checkInDate: Date;
  readonly checkOutDate: Date;
  readonly nightCount: number;
} {
  assertPolicyConsistent(policy);

  return {
    checkInDate: policy.checkInDate,
    checkOutDate: policy.checkOutDate,
    nightCount: policy.nightCount,
  };
}

/**
 * Primera plaza libre de una habitación, o `null` si está llena.
 *
 * Las plazas se numeran desde 1 y el disparador de la base rechaza cualquiera
 * fuera de `[1, capacity]`. Se elige la más baja disponible en vez de la
 * siguiente al máximo ocupado: si la plaza 2 de cuatro queda libre porque
 * alguien canceló, la siguiente persona la ocupa en lugar de dejar un hueco
 * permanente en una habitación que el índice único ya no deja rellenar de otra
 * forma.
 *
 * Devolver `null` no es un error: significa habitación llena, y quien llama
 * probará la siguiente.
 */
export function firstFreeBed(capacity: number, taken: readonly number[]): number | null {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new DomainError(
      'LODGING_POLICY_INVALID',
      `Capacidad de habitación no válida: ${String(capacity)}.`,
    );
  }

  const ocupadas = new Set(taken);

  for (let plaza = 1; plaza <= capacity; plaza += 1) {
    if (!ocupadas.has(plaza)) return plaza;
  }

  return null;
}

/**
 * Ocupación de un hotel frente a su inventario.
 *
 * HOS-002 prohíbe el contador desincronizable, no contar: `capacity` es la suma
 * de las capacidades de sus habitaciones y `live` el número de reservas vivas,
 * las dos leídas en el momento. Lo que hace fiable el último cupo no es esta
 * función sino que quien llama la ejecute dentro de un cerrojo por hotel; aquí
 * solo se decide sobre cifras ya leídas.
 */
export interface HotelOccupancy {
  readonly capacity: number;
  readonly live: number;
}

/**
 * Exige que quede sitio en el hotel — HOS-002, HOS-016.
 *
 * `LODGING_CAPACITY_EXHAUSTED` y no un genérico: la pantalla lo traduce a
 * «elija otro hotel», que es una acción, y no a «algo falló».
 */
export function assertHotelHasRoom(hotelName: string, occupancy: HotelOccupancy): void {
  if (!hasAvailability(occupancy.capacity, occupancy.live)) {
    throw new DomainError(
      'LODGING_CAPACITY_EXHAUSTED',
      `${hotelName} no tiene plazas disponibles. Elija otro hotel.`,
    );
  }
}

/**
 * ¿Puede esta inscripción elegir hotel? — HOS-016, HOS-017, REG-020.
 *
 * Se separa del cálculo del mínimo (`unlocksHotelSelection`, en `pricing.ts`)
 * porque son dos preguntas distintas: allí se decide si el importe aprobado
 * alcanza, y aquí si la modalidad admite siquiera la pregunta.
 *
 * HOS-017 es la parte que un sistema de reservas corriente haría al revés:
 * **pagar al llegar no reserva hotel por anticipado.** Quien elige esa
 * modalidad no se queda sin hospedaje; se le asigna entre lo que quede al
 * llegar, y por eso el rechazo lo dice en vez de sonar a impedimento.
 */
export function assertMayChooseHotel(input: {
  readonly paymentMode: 'ADVANCE' | 'ARRIVAL';
  readonly unlockedByPayment: boolean;
}): void {
  if (input.paymentMode === 'ARRIVAL') {
    throw new DomainError(
      'LODGING_NOT_ELIGIBLE',
      'La modalidad «pago al llegar» no reserva hotel por anticipado (HOS-017). ' +
        'Hospedaje le asignará alojamiento entre la disponibilidad restante al llegar.',
    );
  }

  if (!input.unlockedByPayment) {
    throw new DomainError(
      'LODGING_NOT_ELIGIBLE',
      'Podrá elegir hotel cuando esté aprobado el pago mínimo de su modalidad anticipada (REG-020).',
    );
  }
}

/**
 * Datos con los que se da de alta o se corrige un hotel.
 *
 * El código lo pone la organización y no se valida su forma: es el nombre con
 * el que ya llaman a ese hotel en sus papeles, y exigirle un patrón obligaría a
 * inventar uno distinto del que usan. Lo que sí se exige es que exista y no sea
 * espacio en blanco, porque es la clave por gestión.
 */
export function assertHotelDetails(input: { readonly code: string; readonly name: string }): void {
  if (input.code.trim() === '') {
    throw new DomainError('LODGING_POLICY_INVALID', 'El hotel necesita un código.');
  }

  if (input.name.trim() === '') {
    throw new DomainError('LODGING_POLICY_INVALID', 'El hotel necesita un nombre.');
  }
}

/**
 * Datos de una habitación, con su capacidad frente a quien ya está dentro.
 *
 * **Bajar la capacidad por debajo de lo ocupado es el caso que importa.** Una
 * habitación de cuatro con tres personas dentro no puede pasar a dos: las
 * reservas ya escritas seguirían ahí y el inventario diría que caben menos de
 * las que hay, así que la ocupación superaría a la capacidad y el hotel
 * anunciaría plazas negativas. No es un error de tecleo improbable: pasa al
 * corregir una habitación que se cargó mal después de haber asignado gente.
 */
export function assertRoomDetails(input: {
  readonly code: string;
  readonly capacity: number;
  /** Plazas ocupadas ahora mismo por reservas vivas. */
  readonly occupied: number;
}): void {
  if (input.code.trim() === '') {
    throw new DomainError('LODGING_POLICY_INVALID', 'La habitación necesita un código.');
  }

  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    throw new DomainError(
      'LODGING_POLICY_INVALID',
      'La capacidad debe ser un número entero de al menos una plaza.',
    );
  }

  if (input.capacity < input.occupied) {
    throw new DomainError(
      'LODGING_CAPACITY_EXHAUSTED',
      `La habitación tiene ${String(input.occupied)} plazas ocupadas: no puede quedarse en ${String(input.capacity)}. ` +
        'Mueva primero a quien sobre.',
    );
  }
}

/**
 * ¿Se puede retirar del inventario?
 *
 * Un hotel o una habitación **con gente dentro** no se desactiva. Desactivar no
 * borra las reservas —siguen apuntando ahí— pero sí saca las plazas del
 * inventario, y entonces el hotel cuenta menos capacidad de la que tiene
 * ocupada. Quien quiera cerrar una habitación tiene que mover antes a su gente,
 * que es además lo que haría de todos modos.
 */
export function assertDeactivable(label: string, live: number): void {
  if (live > 0) {
    throw new DomainError(
      'LODGING_NOT_ELIGIBLE',
      `${label} tiene ${String(live)} ${live === 1 ? 'reserva viva' : 'reservas vivas'}. ` +
        'Reasígnelas antes de retirarlo del inventario.',
    );
  }
}
