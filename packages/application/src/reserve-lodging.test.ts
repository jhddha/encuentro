import { DomainError, type Actor, type LodgingPolicy } from '@encuentro/domain';
import { describe, expect, it } from 'vitest';

import {
  assignRoom,
  chooseHotel,
  type AssignRoomInput,
  type CreateReservationInput,
  type HotelForSelection,
  type LodgingRepository,
  type RegistrationForLodging,
  type ReservationForAssignment,
  type RoomForAssignment,
} from './reserve-lodging.js';

const EVENTO = 'evt-1';
const INSCRIPCION = 'reg-1';
const HOTEL = 'hotel-1';
const HABITACION = 'room-1';
const RESERVA = 'res-1';
const PEREGRINO = 'u-peregrino';

const AHORA = new Date('2026-08-14T15:00:00.000Z');
const reloj = { now: () => AHORA };

/** El peregrino no tiene asignaciones: le autoriza la titularidad (PAY-021). */
function peregrino(userId = PEREGRINO): Actor {
  return { userId, assignments: [] };
}

function hospedaje(permisos: readonly string[] = ['lodging.assign_room']): Actor {
  return {
    userId: 'u-hospedaje',
    assignments: [{ permissions: permisos, scope: { type: 'EVENT', eventId: EVENTO } }],
  };
}

const POLITICA: LodgingPolicy = {
  eventId: EVENTO,
  nightCount: 7,
  checkInDate: new Date('2026-11-01T00:00:00Z'),
  checkOutDate: new Date('2026-11-08T00:00:00Z'),
};

function inscripcion(overrides: Partial<RegistrationForLodging> = {}): RegistrationForLodging {
  return {
    id: INSCRIPCION,
    eventId: EVENTO,
    eventStatus: 'ACTIVE',
    status: 'CONFIRMED',
    paymentMode: 'ADVANCE',
    ownerUserId: PEREGRINO,
    unlockedByPayment: true,
    ...overrides,
  };
}

function hotel(overrides: Partial<HotelForSelection> = {}): HotelForSelection {
  return {
    id: HOTEL,
    eventId: EVENTO,
    name: 'Hotel Central',
    active: true,
    capacity: 20,
    live: 5,
    ...overrides,
  };
}

function reserva(overrides: Partial<ReservationForAssignment> = {}): ReservationForAssignment {
  return {
    id: RESERVA,
    eventId: EVENTO,
    eventStatus: 'ACTIVE',
    registrationId: INSCRIPCION,
    hotelId: HOTEL,
    status: 'HELD',
    roomId: null,
    bedIndex: null,
    version: 1,
    ...overrides,
  };
}

function habitacion(overrides: Partial<RoomForAssignment> = {}): RoomForAssignment {
  return {
    id: HABITACION,
    hotelId: HOTEL,
    code: '101',
    capacity: 4,
    active: true,
    takenBeds: [],
    ...overrides,
  };
}

interface RepoFalso extends LodgingRepository {
  readonly retenidas: CreateReservationInput[];
  readonly asignadas: AssignRoomInput[];
}

function repositorio(
  estado: {
    policy?: LodgingPolicy | null;
    registration?: RegistrationForLodging | null;
    hotels?: readonly HotelForSelection[];
    live?: ReservationForAssignment | null;
    reservation?: ReservationForAssignment | null;
    room?: RoomForAssignment | null;
    lleno?: boolean;
    aplica?: boolean;
  } = {},
): RepoFalso {
  const retenidas: CreateReservationInput[] = [];
  const asignadas: AssignRoomInput[] = [];

  return {
    retenidas,
    asignadas,
    findPolicy: () => Promise.resolve(estado.policy === undefined ? POLITICA : estado.policy),
    findRegistration: () =>
      Promise.resolve(estado.registration === undefined ? inscripcion() : estado.registration),
    listHotels: () => Promise.resolve(estado.hotels ?? [hotel()]),
    findLiveReservation: () => Promise.resolve(estado.live ?? null),
    hold: (input) => {
      retenidas.push(input);
      return Promise.resolve(estado.lleno === true ? null : { reservationId: RESERVA });
    },
    findReservationForAssignment: () =>
      Promise.resolve(estado.reservation === undefined ? reserva() : estado.reservation),
    findRoom: () => Promise.resolve(estado.room === undefined ? habitacion() : estado.room),
    assignRoom: (input) => {
      asignadas.push(input);
      return Promise.resolve(estado.aplica !== false);
    },
  };
}

const eleccion = { eventId: EVENTO, registrationId: INSCRIPCION, hotelId: HOTEL } as const;

describe('el peregrino elige hotel — HOS-015, HOS-016', () => {
  it('crea la retención con las fechas de la política', async () => {
    const repo = repositorio();

    const id = await chooseHotel({ lodging: repo, clock: reloj }, peregrino(), eleccion);

    expect(id).toBe(RESERVA);
    expect(repo.retenidas[0]).toMatchObject({
      hotelId: HOTEL,
      nightCount: 7,
      checkInDate: POLITICA.checkInDate,
      checkOutDate: POLITICA.checkOutDate,
    });
  });

  /* DEC-005: treinta minutos, contados desde el reloj de la aplicación. */
  it('la retención vence a los treinta minutos', async () => {
    const repo = repositorio();
    await chooseHotel({ lodging: repo, clock: reloj }, peregrino(), eleccion);

    expect(repo.retenidas[0]?.heldUntil).toEqual(new Date('2026-08-14T15:30:00.000Z'));
  });

  /*
   * HOS-017. Es la regla que un sistema de reservas corriente haría al revés, y
   * la que más importa que no se relaje: reservar por anticipado a quien paga
   * al llegar le quitaría la cama a alguien que ya pagó.
   */
  it('el que paga al llegar no reserva por anticipado', async () => {
    const repo = repositorio({ registration: inscripcion({ paymentMode: 'ARRIVAL' }) });

    await expect(
      chooseHotel({ lodging: repo, clock: reloj }, peregrino(), eleccion),
    ).rejects.toMatchObject({ code: 'LODGING_NOT_ELIGIBLE' });

    expect(repo.retenidas).toHaveLength(0);
  });

  it('el anticipado sin el mínimo aprobado todavía no puede', async () => {
    const repo = repositorio({ registration: inscripcion({ unlockedByPayment: false }) });

    await expect(
      chooseHotel({ lodging: repo, clock: reloj }, peregrino(), eleccion),
    ).rejects.toThrow(/pago mínimo/);
  });

  it('nadie elige hotel sobre la inscripción de otra persona', async () => {
    const repo = repositorio();

    await expect(
      chooseHotel({ lodging: repo, clock: reloj }, peregrino('u-intruso'), eleccion),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(repo.retenidas).toHaveLength(0);
  });

  it('una inscripción de otra gestión no se distingue de una inexistente', async () => {
    const repo = repositorio({ registration: inscripcion({ eventId: 'otra' }) });

    await expect(
      chooseHotel({ lodging: repo, clock: reloj }, peregrino(), eleccion),
    ).rejects.toThrow(/no está disponible/);
  });

  it('una inscripción cancelada no recibe hospedaje (REG-009)', async () => {
    const repo = repositorio({ registration: inscripcion({ status: 'CANCELLED' }) });

    await expect(
      chooseHotel({ lodging: repo, clock: reloj }, peregrino(), eleccion),
    ).rejects.toThrow(/cancelada/);
  });

  it.each(['OPERATIONALLY_CLOSED', 'FINANCIALLY_CLOSED', 'ARCHIVED'] as const)(
    'una gestión en %s no admite reservas',
    async (estado) => {
      const repo = repositorio({ registration: inscripcion({ eventStatus: estado }) });

      await expect(
        chooseHotel({ lodging: repo, clock: reloj }, peregrino(), eleccion),
      ).rejects.toMatchObject({ code: 'EVENT_OPERATIONS_BLOCKED' });
    },
  );

  it('una segunda reserva viva se rechaza diciendo qué hacer', async () => {
    const repo = repositorio({ live: reserva({ hotelId: 'otro-hotel' }) });

    await expect(
      chooseHotel({ lodging: repo, clock: reloj }, peregrino(), eleccion),
    ).rejects.toThrow(/Libérela antes de elegir otro hotel/);
  });

  it('reelegir el mismo hotel lo dice sin sonar a error', async () => {
    const repo = repositorio({ live: reserva() });

    await expect(
      chooseHotel({ lodging: repo, clock: reloj }, peregrino(), eleccion),
    ).rejects.toThrow(/Ya tiene una reserva en este hotel/);
  });

  it('un hotel de otra gestión no se puede elegir por su identificador', async () => {
    const repo = repositorio({ hotels: [] });

    await expect(
      chooseHotel({ lodging: repo, clock: reloj }, peregrino(), eleccion),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('un hotel inactivo no admite reservas', async () => {
    const repo = repositorio({ hotels: [hotel({ active: false })] });

    await expect(
      chooseHotel({ lodging: repo, clock: reloj }, peregrino(), eleccion),
    ).rejects.toThrow(/no admite reservas/);
  });

  it('un hotel lleno se rechaza antes de abrir la transacción', async () => {
    const repo = repositorio({ hotels: [hotel({ capacity: 20, live: 20 })] });

    await expect(
      chooseHotel({ lodging: repo, clock: reloj }, peregrino(), eleccion),
    ).rejects.toThrow(/Elija otro hotel/);

    expect(repo.retenidas).toHaveLength(0);
  });

  /*
   * La carrera del último cupo. El caso de uso ya comprobó que quedaba sitio,
   * pero entre esa lectura y la escritura entró otra persona: quien decide es
   * el repositorio, dentro del cerrojo, y devuelve nulo.
   */
  it('si el hotel se llena mientras tanto, lo dice y no inventa una reserva', async () => {
    const repo = repositorio({ lleno: true });

    await expect(
      chooseHotel({ lodging: repo, clock: reloj }, peregrino(), eleccion),
    ).rejects.toMatchObject({ code: 'LODGING_CAPACITY_EXHAUSTED' });
  });

  it('sin política de hospedaje no se reserva nada', async () => {
    const repo = repositorio({ policy: null });

    await expect(
      chooseHotel({ lodging: repo, clock: reloj }, peregrino(), eleccion),
    ).rejects.toMatchObject({ code: 'LODGING_POLICY_INVALID' });

    expect(repo.retenidas).toHaveLength(0);
  });
});

const asignacion = {
  eventId: EVENTO,
  reservationId: RESERVA,
  expectedVersion: 1,
  roomId: HABITACION,
} as const;

describe('Hospedaje asigna la habitación — HOS-001, HOS-005', () => {
  it('confirma la reserva tomando la primera plaza libre', async () => {
    const repo = repositorio();

    await assignRoom({ lodging: repo, clock: reloj }, hospedaje(), asignacion);

    expect(repo.asignadas[0]).toMatchObject({ roomId: HABITACION, bedIndex: 1 });
    expect(repo.asignadas[0]?.overrideReason).toBeNull();
  });

  it('respeta la plaza pedida cuando se da', async () => {
    const repo = repositorio({ room: habitacion({ takenBeds: [1] }) });

    await assignRoom({ lodging: repo, clock: reloj }, hospedaje(), { ...asignacion, bedIndex: 3 });

    expect(repo.asignadas[0]?.bedIndex).toBe(3);
  });

  it('salta las plazas ocupadas', async () => {
    const repo = repositorio({ room: habitacion({ takenBeds: [1, 2] }) });

    await assignRoom({ lodging: repo, clock: reloj }, hospedaje(), asignacion);

    expect(repo.asignadas[0]?.bedIndex).toBe(3);
  });

  /* HOS-005: cambiar de habitación es la misma escritura sobre una confirmada. */
  it('cambia de habitación una reserva ya confirmada', async () => {
    const repo = repositorio({
      reservation: reserva({ status: 'CONFIRMED', roomId: 'room-vieja', bedIndex: 2, version: 4 }),
    });

    await assignRoom({ lodging: repo, clock: reloj }, hospedaje(), {
      ...asignacion,
      expectedVersion: 4,
    });

    expect(repo.asignadas[0]).toMatchObject({ roomId: HABITACION, expectedVersion: 4 });
  });

  it('exige el permiso de asignar', async () => {
    const repo = repositorio();

    await expect(
      assignRoom({ lodging: repo, clock: reloj }, hospedaje(['lodging.read']), asignacion),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(repo.asignadas).toHaveLength(0);
  });

  it('no asigna sobre una reserva ya liberada', async () => {
    const repo = repositorio({ reservation: reserva({ status: 'RELEASED' }) });

    await expect(
      assignRoom({ lodging: repo, clock: reloj }, hospedaje(), asignacion),
    ).rejects.toThrow(/no admite asignación/);
  });

  it('no acepta una habitación de otro hotel', async () => {
    const repo = repositorio({ room: habitacion({ hotelId: 'otro-hotel' }) });

    await expect(
      assignRoom({ lodging: repo, clock: reloj }, hospedaje(), asignacion),
    ).rejects.toThrow(/no pertenece al hotel/);
  });

  it('no asigna a una habitación fuera de servicio', async () => {
    const repo = repositorio({ room: habitacion({ active: false }) });

    await expect(
      assignRoom({ lodging: repo, clock: reloj }, hospedaje(), asignacion),
    ).rejects.toThrow(/fuera de servicio/);
  });

  it('una habitación completa se rechaza nombrando su capacidad', async () => {
    const repo = repositorio({ room: habitacion({ capacity: 2, takenBeds: [1, 2] }) });

    await expect(
      assignRoom({ lodging: repo, clock: reloj }, hospedaje(), asignacion),
    ).rejects.toMatchObject({ code: 'LODGING_CAPACITY_EXHAUSTED' });
  });

  it('falla si otra operación se adelantó', async () => {
    const repo = repositorio({ aplica: false });

    await expect(
      assignRoom({ lodging: repo, clock: reloj }, hospedaje(), asignacion),
    ).rejects.toMatchObject({ code: 'EVENT_VERSION_CONFLICT' });
  });
});

describe('sobreasignación — HOS-006', () => {
  const conOverride = hospedaje(['lodging.assign_room', 'lodging.override_capacity']);

  it('una plaza fuera de la capacidad exige el permiso aparte', async () => {
    const repo = repositorio({ room: habitacion({ capacity: 4 }) });

    await expect(
      assignRoom({ lodging: repo, clock: reloj }, hospedaje(), {
        ...asignacion,
        bedIndex: 5,
        overrideReason: 'Cama supletoria confirmada con el hotel.',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(repo.asignadas).toHaveLength(0);
  });

  it('con el permiso y un motivo, se registra como sobreasignación', async () => {
    const repo = repositorio({ room: habitacion({ capacity: 4 }) });

    await assignRoom({ lodging: repo, clock: reloj }, conOverride, {
      ...asignacion,
      bedIndex: 5,
      overrideReason: 'Cama supletoria confirmada con el hotel.',
    });

    expect(repo.asignadas[0]).toMatchObject({
      bedIndex: 5,
      overrideReason: 'Cama supletoria confirmada con el hotel.',
    });
  });

  it('sin motivo no se sobreasigna aunque se tenga el permiso', async () => {
    const repo = repositorio({ room: habitacion({ capacity: 4 }) });

    await expect(
      assignRoom({ lodging: repo, clock: reloj }, conOverride, { ...asignacion, bedIndex: 5 }),
    ).rejects.toThrow(/exige un motivo registrado/);
  });

  it('doblar una plaza ya ocupada también es sobreasignar', async () => {
    const repo = repositorio({ room: habitacion({ takenBeds: [1, 2] }) });

    await expect(
      assignRoom({ lodging: repo, clock: reloj }, hospedaje(), { ...asignacion, bedIndex: 2 }),
    ).rejects.toThrow(DomainError);
  });

  /*
   * El permiso no se pide «por si acaso». Quien asigna habitaciones a diario no
   * debería necesitar el permiso de saltarse las reglas para hacer su trabajo.
   */
  it('una asignación normal no exige el permiso de sobreasignar', async () => {
    const repo = repositorio();

    await assignRoom({ lodging: repo, clock: reloj }, hospedaje(), asignacion);

    expect(repo.asignadas).toHaveLength(1);
  });
});
