import {
  DomainError,
  acceptsRegistrationsAndPayments,
  assertHotelHasRoom,
  assertMayChooseHotel,
  authorize,
  authorizeOwnership,
  canTransitionReservation,
  firstFreeBed,
  heldExpiresAt,
  reservationDatesFrom,
  type Actor,
  type EventState,
  type LodgingPolicy,
  type LodgingState,
  type RegistrationState,
} from '@encuentro/domain';

import type { Clock } from './ports.js';

/**
 * Hospedaje: elegir hotel y asignar habitación — HOS-001, HOS-002, HOS-005,
 * HOS-006, HOS-011, HOS-015, HOS-016, HOS-017.
 *
 * Es la mitad que faltaba de la fase 5. El dominio decidía disponibilidad y
 * expiración, la base tenía sus garantías y el worker liberaba retenciones
 * vencidas — pero **nada creaba una reserva**, así que el worker llevaba
 * semanas vigilando un conjunto vacío.
 *
 * El reparto de responsabilidades es HOS-015 y no es negociable: **el peregrino
 * elige hotel, Hospedaje asigna habitación.** De ahí que sean dos operaciones y
 * no una, con dos autorizaciones distintas —titularidad y permiso— y dos
 * estados: `HELD` al elegir, `CONFIRMED` al asignar.
 *
 * La retención dura treinta minutos (DEC-005). Cubre la elección, no la espera
 * de que alguien revise un pago: HOS-016 sitúa la elección **después** de la
 * aprobación, así que funciona como un carrito.
 */

/** Inscripción vista desde hospedaje. */
export interface RegistrationForLodging {
  readonly id: string;
  readonly eventId: string;
  readonly eventStatus: EventState;
  readonly status: RegistrationState;
  readonly paymentMode: 'ADVANCE' | 'ARRIVAL';
  /** Cuenta de la persona, o `null` si se inscribió sin correo (IAM-012). */
  readonly ownerUserId: string | null;
  /**
   * ¿Alcanza lo **aprobado** el mínimo de su modalidad? — REG-020.
   *
   * Lo calcula el repositorio con `unlocksHotelSelection` sobre el importe
   * asignado, no sobre el declarado: PAY-025 es explícito en que subir una
   * evidencia no confirma nada.
   */
  readonly unlockedByPayment: boolean;
}

export interface HotelForSelection {
  readonly id: string;
  readonly eventId: string;
  readonly name: string;
  readonly active: boolean;
  /** Suma de las capacidades de sus habitaciones. Inventario, no contador. */
  readonly capacity: number;
  /** Reservas vivas (`HELD` o `CONFIRMED`) en este hotel. */
  readonly live: number;
}

export interface ReservationForAssignment {
  readonly id: string;
  readonly eventId: string;
  readonly eventStatus: EventState;
  readonly registrationId: string;
  readonly hotelId: string;
  readonly status: LodgingState;
  readonly roomId: string | null;
  readonly bedIndex: number | null;
  readonly version: number;
}

export interface RoomForAssignment {
  readonly id: string;
  readonly hotelId: string;
  readonly code: string;
  readonly capacity: number;
  readonly active: boolean;
  /** Plazas ya ocupadas por reservas vivas, sin contar la que se está moviendo. */
  readonly takenBeds: readonly number[];
}

export interface CreateReservationInput {
  readonly eventId: string;
  readonly registrationId: string;
  readonly hotelId: string;
  readonly checkInDate: Date;
  readonly checkOutDate: Date;
  readonly nightCount: number;
  readonly heldUntil: Date;
  readonly actorId: string;
}

export interface AssignRoomInput {
  readonly reservationId: string;
  readonly expectedVersion: number;
  readonly roomId: string;
  readonly bedIndex: number;
  readonly actorId: string;
  /** Obligatorio al sobreasignar — HOS-006. Nulo en una asignación normal. */
  readonly overrideReason: string | null;
}

export interface LodgingRepository {
  findPolicy(eventId: string): Promise<LodgingPolicy | null>;
  findRegistration(registrationId: string): Promise<RegistrationForLodging | null>;

  /**
   * Hoteles de la gestión con su inventario y su ocupación.
   *
   * **Se lee dentro del cerrojo del hotel** cuando se va a reservar. Fuera de
   * él sirve para pintar la pantalla, y ahí una cifra de hace un segundo es
   * aceptable: lo que no puede pasar es decidir el último cupo con ella.
   */
  listHotels(eventId: string): Promise<readonly HotelForSelection[]>;

  /** ¿Tiene ya esta inscripción una reserva viva? La base también lo impide. */
  findLiveReservation(registrationId: string): Promise<ReservationForAssignment | null>;

  /**
   * Crea la retención serializando por hotel.
   *
   * El cerrojo es de transacción y cubre leer la ocupación y escribir la fila:
   * sin él, dos personas que piden la última plaza a la vez leen «queda una» y
   * las dos entran. Es el mismo patrón que serializa la numeración de
   * comprobantes, y por el mismo motivo.
   *
   * Devuelve `null` si el hotel se llenó mientras tanto.
   */
  hold(input: CreateReservationInput): Promise<{ readonly reservationId: string } | null>;

  findReservationForAssignment(reservationId: string): Promise<ReservationForAssignment | null>;
  findRoom(
    roomId: string,
    excludingReservationId: string | null,
  ): Promise<RoomForAssignment | null>;

  /**
   * Asigna o cambia la habitación, y confirma, en una sola transacción.
   *
   * HOS-005: el cambio libera la plaza anterior y toma la nueva a la vez. Si
   * fallara a mitad quedaría una plaza perdida —nadie la ocupa y nadie puede
   * pedirla— o duplicada, que es peor.
   *
   * Devuelve `false` si otra operación se adelantó.
   */
  assignRoom(input: AssignRoomInput): Promise<boolean>;
}

export interface ReserveLodgingDeps {
  readonly lodging: LodgingRepository;
  readonly clock: Clock;
}

export interface ChooseHotelCommand {
  readonly eventId: string;
  readonly registrationId: string;
  readonly hotelId: string;
}

/**
 * El peregrino elige hotel — HOS-015, HOS-016, HOS-017.
 *
 * Lo autoriza la **titularidad**, no un permiso: igual que al declarar un pago,
 * el peregrino no tiene asignaciones de rol y lo que le habilita es que la
 * inscripción sea suya (PAY-021 lo dice para pagos y aquí vale la misma
 * lógica). Darle un rol para que pueda elegir su hotel le daría alcance sobre
 * el de los demás.
 */
export async function chooseHotel(
  deps: ReserveLodgingDeps,
  actor: Actor,
  command: ChooseHotelCommand,
): Promise<string> {
  const registration = await deps.lodging.findRegistration(command.registrationId);

  if (registration?.eventId !== command.eventId) {
    // Mismo mensaje que la falta de titularidad: distinguir «no existe» de «no
    // es tuya» permitiría enumerar inscripciones ajenas por identificador.
    throw new DomainError('FORBIDDEN', 'La inscripción solicitada no está disponible.');
  }

  authorizeOwnership(actor, registration.ownerUserId);

  if (!acceptsRegistrationsAndPayments(registration.eventStatus)) {
    throw new DomainError(
      'EVENT_OPERATIONS_BLOCKED',
      `La gestión está en ${registration.eventStatus} y no admite reservas.`,
    );
  }

  if (registration.status === 'CANCELLED') {
    throw new DomainError(
      'LODGING_NOT_ELIGIBLE',
      'La inscripción está cancelada y no admite hospedaje (REG-009).',
    );
  }

  assertMayChooseHotel({
    paymentMode: registration.paymentMode,
    unlockedByPayment: registration.unlockedByPayment,
  });

  /*
   * Una inscripción no puede tener dos reservas vivas. La base lo impide con un
   * índice único parcial, así que esto no es la garantía: es lo que convierte
   * el choque en un mensaje que dice qué hacer en vez de en un error de
   * restricción.
   */
  const viva = await deps.lodging.findLiveReservation(registration.id);

  if (viva !== null) {
    throw new DomainError(
      'LODGING_NOT_ELIGIBLE',
      viva.hotelId === command.hotelId
        ? 'Ya tiene una reserva en este hotel.'
        : 'Ya tiene una reserva activa. Libérela antes de elegir otro hotel.',
    );
  }

  const hotel = (await deps.lodging.listHotels(command.eventId)).find(
    (candidato) => candidato.id === command.hotelId,
  );

  if (hotel?.eventId !== command.eventId) {
    throw new DomainError('FORBIDDEN', 'El hotel solicitado no está disponible en esta gestión.');
  }

  if (!hotel.active) {
    throw new DomainError('LODGING_NOT_ELIGIBLE', `${hotel.name} no admite reservas.`);
  }

  /*
   * Se comprueba aquí **y** dentro del cerrojo, al escribir. Esta comprobación
   * existe para dar un mensaje decente antes de abrir una transacción; la que
   * decide de verdad es la de dentro, porque entre leer y escribir cabe otra
   * persona.
   */
  assertHotelHasRoom(hotel.name, { capacity: hotel.capacity, live: hotel.live });

  const policy = await deps.lodging.findPolicy(command.eventId);

  if (policy === null) {
    throw new DomainError(
      'LODGING_POLICY_INVALID',
      'La gestión no tiene configurada su política de hospedaje (HOS-011). Avise a la organización.',
    );
  }

  // HOS-011 y HOS-014: las fechas y las noches salen de la política, no de la
  // persona. Una sola fuente, y se valida antes de copiarla.
  const fechas = reservationDatesFrom(policy);
  const ahora = deps.clock.now();

  const creada = await deps.lodging.hold({
    eventId: command.eventId,
    registrationId: registration.id,
    hotelId: hotel.id,
    ...fechas,
    // DEC-005. La columna es obligatoria mientras el estado sea `HELD`, y la
    // base lo impone con un CHECK.
    heldUntil: heldExpiresAt(ahora),
    actorId: actor.userId,
  });

  if (creada === null) {
    throw new DomainError(
      'LODGING_CAPACITY_EXHAUSTED',
      `${hotel.name} se llenó mientras confirmaba su elección. Elija otro hotel.`,
    );
  }

  return creada.reservationId;
}

export interface AssignRoomCommand {
  readonly eventId: string;
  readonly reservationId: string;
  readonly expectedVersion: number;
  readonly roomId: string;
  /**
   * Plaza concreta, o `null` para que se elija la primera libre.
   *
   * Quien asigna suele no querer decidir el número de cama; cuando sí quiere
   * —juntar a una familia, separar a quien ronca— puede darlo.
   */
  readonly bedIndex?: number;
  /** Motivo de la sobreasignación — HOS-006. */
  readonly overrideReason?: string;
}

/**
 * Hospedaje asigna la habitación — HOS-001, HOS-005, HOS-006.
 *
 * Lo autoriza `lodging.assign_room`, y la sobreasignación exige además
 * `lodging.override_capacity` **y** un motivo. Sirve para asignar por primera
 * vez y para cambiar de habitación: son la misma escritura, y HOS-005 pide que
 * el cambio libere y tome plaza en una sola transacción.
 */
export async function assignRoom(
  deps: ReserveLodgingDeps,
  actor: Actor,
  command: AssignRoomCommand,
): Promise<void> {
  authorize(actor, 'lodging.assign_room', { type: 'EVENT', eventId: command.eventId });

  const reserva = await deps.lodging.findReservationForAssignment(command.reservationId);

  if (reserva?.eventId !== command.eventId) {
    throw new DomainError('FORBIDDEN', 'La reserva solicitada no está disponible.');
  }

  if (!acceptsRegistrationsAndPayments(reserva.eventStatus)) {
    throw new DomainError(
      'EVENT_OPERATIONS_BLOCKED',
      `La gestión está en ${reserva.eventStatus} y no admite cambios de hospedaje.`,
    );
  }

  /*
   * Asignar sobre una reserva ya confirmada es un **cambio** de habitación y
   * está permitido; sobre una liberada, cancelada o expirada no lo está. La
   * transición se comprueba contra la máquina de estados, que no admite
   * `CONFIRMED -> CONFIRMED` por definición: se pregunta por el caso real, que
   * es si la reserva sigue viva.
   */
  if (reserva.status !== 'HELD' && reserva.status !== 'CONFIRMED') {
    throw new DomainError(
      'LODGING_NOT_ELIGIBLE',
      `Una reserva en ${reserva.status} no admite asignación de habitación.`,
    );
  }

  if (reserva.status === 'HELD' && !canTransitionReservation('HELD', 'CONFIRMED')) {
    throw new DomainError('LODGING_NOT_ELIGIBLE', 'La reserva no puede confirmarse.');
  }

  /*
   * Las plazas ocupadas se leen **excluyendo esta reserva**. Sin eso, cambiar a
   * alguien de la plaza 2 a la 3 de su propia habitación se rechazaría por
   * chocar consigo mismo, y mover a alguien dentro de la misma habitación es
   * una operación corriente.
   */
  const habitacion = await deps.lodging.findRoom(command.roomId, reserva.id);

  if (habitacion?.hotelId !== reserva.hotelId) {
    throw new DomainError(
      'FORBIDDEN',
      'La habitación solicitada no pertenece al hotel de esta reserva.',
    );
  }

  if (!habitacion.active) {
    throw new DomainError(
      'LODGING_NOT_ELIGIBLE',
      `La habitación ${habitacion.code} está fuera de servicio.`,
    );
  }

  const plaza =
    command.bedIndex ?? firstFreeBed(habitacion.capacity, habitacion.takenBeds) ?? undefined;

  if (plaza === undefined) {
    throw new DomainError(
      'LODGING_CAPACITY_EXHAUSTED',
      `La habitación ${habitacion.code} está completa (${String(habitacion.capacity)} plazas).`,
    );
  }

  /*
   * HOS-006, la sobreasignación.
   *
   * Ocurre cuando se pide una plaza que no existe en el inventario de la
   * habitación —la número 5 de una de cuatro— o una ya ocupada. Exige un
   * permiso aparte y un motivo, y los dos se comprueban aquí antes de que la
   * base rechace la escritura, porque el disparador diría «excede la
   * capacidad» sin distinguir el descuido de la decisión.
   *
   * El permiso no se comprueba «por si acaso»: se comprueba solo cuando la
   * operación lo es. Pedirlo siempre convertiría a quien asigna habitaciones en
   * alguien que necesita el permiso de saltarse las reglas para hacer su
   * trabajo normal.
   */
  const sobreasigna = plaza > habitacion.capacity || habitacion.takenBeds.includes(plaza);

  if (sobreasigna) {
    authorize(actor, 'lodging.override_capacity', { type: 'EVENT', eventId: command.eventId });

    if (command.overrideReason === undefined || command.overrideReason.trim() === '') {
      throw new DomainError(
        'LODGING_CAPACITY_EXHAUSTED',
        'Sobreasignar una plaza exige un motivo registrado (HOS-006).',
      );
    }
  }

  const aplicado = await deps.lodging.assignRoom({
    reservationId: reserva.id,
    expectedVersion: command.expectedVersion,
    roomId: habitacion.id,
    bedIndex: plaza,
    actorId: actor.userId,
    overrideReason: sobreasigna ? (command.overrideReason?.trim() ?? null) : null,
  });

  if (!aplicado) {
    throw new DomainError(
      'EVENT_VERSION_CONFLICT',
      'La reserva cambió mientras preparaba esta operación. Vuelva a cargarla e inténtelo de nuevo.',
    );
  }
}
