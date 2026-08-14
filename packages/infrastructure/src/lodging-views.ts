import { remainingCapacity, type LodgingState } from '@encuentro/domain';

import type { PrismaClient } from './prisma.js';

/**
 * Consultas de pantalla de hospedaje.
 *
 * Mismo trato que `account-statement.ts` y `listProofsPendingReview`: aquí no
 * se decide nada, se lee y se cuenta. Las reglas —quién puede elegir, si queda
 * sitio, qué plaza toca— viven en el dominio y las aplica el caso de uso.
 *
 * La disponibilidad que se muestra es de hace un instante y puede estar
 * desactualizada cuando la persona pulse. Es aceptable **porque quien decide el
 * último cupo es el cerrojo del repositorio**, no esta cifra: lo peor que pasa
 * es que alguien vea «queda 1» y reciba un «elija otro hotel», que es un
 * mensaje honesto y no una reserva fantasma.
 */

export interface HotelOption {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly capacity: number;
  readonly remaining: number;
}

export interface MyReservation {
  readonly id: string;
  readonly status: LodgingState;
  readonly hotelName: string;
  readonly hotelAddress: string | null;
  /** HOS-015: nula mientras Hospedaje no la asigne. */
  readonly roomCode: string | null;
  readonly bedIndex: number | null;
  readonly checkInDate: Date;
  readonly checkOutDate: Date;
  readonly nightCount: number;
  readonly heldUntil: Date | null;
  readonly version: number;
}

export interface MyLodging {
  readonly registrationId: string;
  readonly paymentMode: string;
  readonly reservation: MyReservation | null;
  readonly hotels: readonly HotelOption[];
  /** Noches y fechas de la gestión, o nulo si nadie configuró la política. */
  readonly policy: { readonly nightCount: number; readonly checkInDate: Date } | null;
}

/**
 * Hospedaje de la persona de la sesión.
 *
 * Se busca **por el usuario**, no por un identificador de la URL: aceptarlo
 * dejaría que cualquiera viera —y cambiara— el hospedaje de cualquiera. Es la
 * misma frontera que `findAccountStatement`.
 */
export async function findMyLodging(
  prisma: PrismaClient,
  eventId: string,
  userId: string,
): Promise<MyLodging | null> {
  const registration = await prisma.registration.findFirst({
    where: { eventId, person: { userId } },
    select: { id: true, paymentMode: true },
  });

  if (registration === null) return null;

  const reserva = await prisma.reservation.findFirst({
    where: { registrationId: registration.id, status: { in: ['HELD', 'CONFIRMED'] } },
    select: {
      id: true,
      status: true,
      checkInDate: true,
      checkOutDate: true,
      nightCount: true,
      heldUntil: true,
      bedIndex: true,
      version: true,
      hotel: { select: { name: true, address: true } },
      room: { select: { code: true } },
    },
  });

  const policy = await prisma.eventLodgingPolicy.findUnique({
    where: { eventId },
    select: { nightCount: true, checkInDate: true },
  });

  return {
    registrationId: registration.id,
    paymentMode: registration.paymentMode,
    policy,
    reservation:
      reserva === null
        ? null
        : {
            id: reserva.id,
            status: reserva.status as LodgingState,
            hotelName: reserva.hotel.name,
            hotelAddress: reserva.hotel.address,
            roomCode: reserva.room?.code ?? null,
            bedIndex: reserva.bedIndex,
            checkInDate: reserva.checkInDate,
            checkOutDate: reserva.checkOutDate,
            nightCount: reserva.nightCount,
            heldUntil: reserva.heldUntil,
            version: reserva.version,
          },
    hotels: await listHotelOptions(prisma, eventId),
  };
}

/** Hoteles activos con plazas libres, para ofrecer la elección. */
export async function listHotelOptions(
  prisma: PrismaClient,
  eventId: string,
): Promise<readonly HotelOption[]> {
  const hoteles = await prisma.hotel.findMany({
    where: { eventId, status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      address: true,
      rooms: { where: { status: 'ACTIVE' }, select: { capacity: true } },
      _count: { select: { reservations: { where: { status: { in: ['HELD', 'CONFIRMED'] } } } } },
    },
  });

  return hoteles.map((hotel) => {
    const capacity = hotel.rooms.reduce((total, sala) => total + sala.capacity, 0);

    return {
      id: hotel.id,
      name: hotel.name,
      address: hotel.address,
      capacity,
      remaining: remainingCapacity(capacity, hotel._count.reservations),
    };
  });
}

export interface AssignmentRow {
  readonly reservationId: string;
  readonly version: number;
  /**
   * Solo estados vivos.
   *
   * La consulta filtra por `HELD` y `CONFIRMED`, así que el tipo lo dice en vez
   * de prometer los cinco y obligar a la pantalla a inventar una etiqueta para
   * tres que nunca llegan.
   */
  readonly status: Extract<LodgingState, 'HELD' | 'CONFIRMED'>;
  readonly registrationCode: string;
  readonly personName: string;
  readonly hotelId: string;
  readonly hotelName: string;
  readonly roomCode: string | null;
  readonly bedIndex: number | null;
  readonly heldUntil: Date | null;
}

export interface RoomOption {
  readonly id: string;
  readonly hotelId: string;
  readonly code: string;
  readonly capacity: number;
  readonly occupied: number;
}

/**
 * Bandeja de Hospedaje: reservas vivas y habitaciones donde ponerlas.
 *
 * Las retenidas primero y las más antiguas antes: una `HELD` caduca en treinta
 * minutos (DEC-005), así que quien lleva veinte esperando es a quien hay que
 * atender. Una confirmada no corre prisa —solo se toca para cambiarla de
 * habitación— pero sigue en la lista porque HOS-005 exige poder hacerlo.
 */
export async function listAssignments(
  prisma: PrismaClient,
  eventId: string,
): Promise<{ readonly rows: readonly AssignmentRow[]; readonly rooms: readonly RoomOption[] }> {
  const reservas = await prisma.reservation.findMany({
    where: { eventId, status: { in: ['HELD', 'CONFIRMED'] } },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      version: true,
      status: true,
      bedIndex: true,
      heldUntil: true,
      hotelId: true,
      hotel: { select: { name: true } },
      room: { select: { code: true } },
      registration: { select: { code: true, person: { select: { fullName: true } } } },
    },
  });

  const habitaciones = await prisma.room.findMany({
    where: { hotel: { eventId }, status: 'ACTIVE' },
    orderBy: [{ hotelId: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      hotelId: true,
      code: true,
      capacity: true,
      _count: { select: { reservations: { where: { status: { in: ['HELD', 'CONFIRMED'] } } } } },
    },
  });

  return {
    /*
     * `status: 'asc'` pone CONFIRMED antes que HELD por orden alfabético, que es
     * justo al revés de lo que interesa. Se reordena aquí en vez de con dos
     * consultas: las retenidas primero porque son las que caducan.
     */
    rows: reservas
      .map((r) => ({
        reservationId: r.id,
        version: r.version,
        status: r.status as AssignmentRow['status'],
        registrationCode: r.registration.code,
        personName: r.registration.person.fullName,
        hotelId: r.hotelId,
        hotelName: r.hotel.name,
        roomCode: r.room?.code ?? null,
        bedIndex: r.bedIndex,
        heldUntil: r.heldUntil,
      }))
      .sort((a, b) => (a.status === b.status ? 0 : a.status === 'HELD' ? -1 : 1)),

    rooms: habitaciones.map((sala) => ({
      id: sala.id,
      hotelId: sala.hotelId,
      code: sala.code,
      capacity: sala.capacity,
      occupied: sala._count.reservations,
    })),
  };
}

export interface InventoryRoom {
  readonly id: string;
  readonly code: string;
  readonly capacity: number;
  readonly occupied: number;
  readonly active: boolean;
}

export interface InventoryHotel {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly address: string | null;
  readonly active: boolean;
  readonly rooms: readonly InventoryRoom[];
  /** Plazas de las habitaciones **activas**: es lo que se puede vender. */
  readonly capacity: number;
  readonly live: number;
}

/**
 * Inventario completo de la gestión, para la pantalla de configuración.
 *
 * Incluye los hoteles y habitaciones **inactivos**, al revés que
 * `listHotelOptions`: allí se ofrece lo que se puede reservar y aquí se
 * administra lo que existe. Un hotel retirado del inventario tiene que seguir
 * viéndose para poder volver a activarlo.
 */
export async function listInventory(
  prisma: PrismaClient,
  eventId: string,
): Promise<readonly InventoryHotel[]> {
  const hoteles = await prisma.hotel.findMany({
    where: { eventId },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      address: true,
      status: true,
      _count: { select: { reservations: { where: { status: { in: ['HELD', 'CONFIRMED'] } } } } },
      rooms: {
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          capacity: true,
          status: true,
          _count: {
            select: { reservations: { where: { status: { in: ['HELD', 'CONFIRMED'] } } } },
          },
        },
      },
    },
  });

  return hoteles.map((hotel) => ({
    id: hotel.id,
    code: hotel.code,
    name: hotel.name,
    address: hotel.address,
    active: hotel.status === 'ACTIVE',
    live: hotel._count.reservations,
    capacity: hotel.rooms
      .filter((sala) => sala.status === 'ACTIVE')
      .reduce((total, sala) => total + sala.capacity, 0),
    rooms: hotel.rooms.map((sala) => ({
      id: sala.id,
      code: sala.code,
      capacity: sala.capacity,
      occupied: sala._count.reservations,
      active: sala.status === 'ACTIVE',
    })),
  }));
}

export interface PolicyView {
  readonly nightCount: number;
  /** `YYYY-MM-DD`, que es como los pide el campo de fecha del formulario. */
  readonly checkInDate: string;
  readonly checkOutDate: string;
}

/**
 * La política de la gestión y cuántas reservas vivas dependen ya de ella.
 *
 * El recuento no es adorno: cambiar las fechas **no** reescribe las reservas
 * escritas (HOS-013), así que quien las cambie con gente ya reservada debe
 * saberlo antes de guardar y no descubrirlo después.
 */
export async function findLodgingPolicy(
  prisma: PrismaClient,
  eventId: string,
): Promise<{ readonly policy: PolicyView | null; readonly liveReservations: number }> {
  const fila = await prisma.eventLodgingPolicy.findUnique({
    where: { eventId },
    select: { nightCount: true, checkInDate: true, checkOutDate: true },
  });

  return {
    policy:
      fila === null
        ? null
        : {
            nightCount: fila.nightCount,
            // La columna es `DATE`: se recorta el instante sin que la zona del
            // proceso pueda desplazar el día.
            checkInDate: fila.checkInDate.toISOString().slice(0, 10),
            checkOutDate: fila.checkOutDate.toISOString().slice(0, 10),
          },
    liveReservations: await prisma.reservation.count({
      where: { eventId, status: { in: ['HELD', 'CONFIRMED'] } },
    }),
  };
}
