import {
  DomainError,
  assertDeactivable,
  assertHotelDetails,
  assertPolicyConsistent,
  assertRoomDetails,
  authorize,
  civilDayAnchor,
  type Actor,
  type LodgingPolicy,
} from '@encuentro/domain';

/**
 * Inventario y política de hospedaje — HOS-011, HOS-014, HOS-002.
 *
 * Lo que faltaba para que la fase 5 se pudiera usar. `chooseHotel` y
 * `assignRoom` ya existían, pero los hoteles y las habitaciones había que
 * sembrarlos desde la base: un sistema con reservas y sin forma de cargar el
 * inventario es un sistema que solo funciona si alguien abre `psql`.
 *
 * Todo aquí exige `lodging.manage`. Es distinto de `lodging.assign_room`, que
 * autoriza a colocar gente: cambiar la capacidad de una habitación mueve el
 * inventario de la gestión entera, y quien reparte camas a diario no tiene por
 * qué poder hacerlo.
 */

export interface HotelInput {
  /** Nulo al crear. */
  readonly id: string | null;
  readonly code: string;
  readonly name: string;
  readonly address: string | null;
  readonly active: boolean;
}

export interface RoomInput {
  readonly id: string | null;
  readonly hotelId: string;
  readonly code: string;
  readonly capacity: number;
  readonly active: boolean;
}

export interface PolicyInput {
  readonly nightCount: number;
  /** `YYYY-MM-DD`, como lo teclea una persona. */
  readonly checkInDate: string;
  readonly checkOutDate: string;
}

/** Estado actual de un hotel, para decidir si se puede tocar. */
export interface HotelState {
  readonly id: string;
  readonly eventId: string;
  readonly name: string;
  readonly live: number;
}

/** Estado actual de una habitación. `occupied` son plazas de reservas vivas. */
export interface RoomState {
  readonly id: string;
  readonly hotelId: string;
  readonly eventId: string;
  readonly code: string;
  readonly occupied: number;
}

export interface LodgingConfigRepository {
  findHotel(hotelId: string): Promise<HotelState | null>;
  findRoom(roomId: string): Promise<RoomState | null>;
  /** Solo para comprobar que el hotel al que se cuelga la habitación es de esta gestión. */
  hotelBelongsTo(hotelId: string, eventId: string): Promise<boolean>;

  saveHotel(input: {
    readonly eventId: string;
    readonly hotel: HotelInput;
    readonly actorId: string;
  }): Promise<string>;

  saveRoom(input: {
    readonly eventId: string;
    readonly room: RoomInput;
    readonly actorId: string;
  }): Promise<string>;

  savePolicy(input: {
    readonly eventId: string;
    readonly policy: LodgingPolicy;
    readonly actorId: string;
  }): Promise<void>;
}

export interface ConfigureLodgingDeps {
  readonly config: LodgingConfigRepository;
}

/**
 * Da de alta o corrige un hotel.
 *
 * Devuelve su identificador, que al crear es nuevo y al corregir es el mismo.
 */
export async function saveHotel(
  deps: ConfigureLodgingDeps,
  actor: Actor,
  eventId: string,
  hotel: HotelInput,
): Promise<string> {
  authorize(actor, 'lodging.manage', { type: 'EVENT', eventId });
  assertHotelDetails(hotel);

  if (hotel.id !== null) {
    const actual = await deps.config.findHotel(hotel.id);

    if (actual?.eventId !== eventId) {
      throw new DomainError('FORBIDDEN', 'El hotel solicitado no está en esta gestión.');
    }

    // Retirar del inventario un hotel con gente dentro dejaría su ocupación por
    // encima de su capacidad, que pasaría a ser cero.
    if (!hotel.active) assertDeactivable(actual.name, actual.live);
  }

  return await deps.config.saveHotel({
    eventId,
    hotel: { ...hotel, code: hotel.code.trim(), name: hotel.name.trim() },
    actorId: actor.userId,
  });
}

export async function saveRoom(
  deps: ConfigureLodgingDeps,
  actor: Actor,
  eventId: string,
  room: RoomInput,
): Promise<string> {
  authorize(actor, 'lodging.manage', { type: 'EVENT', eventId });

  if (!(await deps.config.hotelBelongsTo(room.hotelId, eventId))) {
    throw new DomainError('FORBIDDEN', 'El hotel solicitado no está en esta gestión.');
  }

  /*
   * La ocupación actual decide si la capacidad nueva es admisible. Al crear es
   * cero; al corregir, lo que haya dentro. Sin este dato, bajar la capacidad de
   * una habitación con gente pasaría y el hotel anunciaría plazas negativas.
   */
  const actual = room.id === null ? null : await deps.config.findRoom(room.id);

  if (room.id !== null && actual?.eventId !== eventId) {
    throw new DomainError('FORBIDDEN', 'La habitación solicitada no está en esta gestión.');
  }

  assertRoomDetails({
    code: room.code,
    capacity: room.capacity,
    occupied: actual?.occupied ?? 0,
  });

  if (!room.active && actual !== null) {
    assertDeactivable(`La habitación ${actual.code}`, actual.occupied);
  }

  return await deps.config.saveRoom({
    eventId,
    room: { ...room, code: room.code.trim() },
    actorId: actor.userId,
  });
}

/**
 * Fija la política de noches — HOS-011, HOS-014.
 *
 * «Una sola fuente versionada»: la política es única por gestión y de ella
 * salen las fechas de **todas** las reservas (`reservationDatesFrom`). No hay
 * un segundo sitio donde alguien pueda escribir otro número.
 *
 * Cambiarla no reescribe las reservas ya creadas, y eso es deliberado: HOS-013
 * dice que una reserva no se recalcula sola. Quien cambie la política después
 * de haber reservado tendrá dos grupos de reservas con fechas distintas, y es
 * información que la pantalla debe dar antes de guardar, no un efecto que el
 * caso de uso deba adivinar.
 */
export async function savePolicy(
  deps: ConfigureLodgingDeps,
  actor: Actor,
  eventId: string,
  input: PolicyInput,
): Promise<void> {
  authorize(actor, 'lodging.manage', { type: 'EVENT', eventId });

  const checkInDate = civilDayAnchor(input.checkInDate);
  const checkOutDate = civilDayAnchor(input.checkOutDate);

  if (checkInDate === null || checkOutDate === null) {
    throw new DomainError(
      'LODGING_POLICY_INVALID',
      'Indique fechas de entrada y salida válidas (día, mes y año).',
    );
  }

  const policy: LodgingPolicy = {
    eventId,
    nightCount: input.nightCount,
    checkInDate,
    checkOutDate,
  };

  // La misma comprobación que la base impone con un CHECK. Aquí para que el
  // mensaje diga qué no cuadra en vez de nombrar una restricción.
  assertPolicyConsistent(policy);

  await deps.config.savePolicy({ eventId, policy, actorId: actor.userId });
}
