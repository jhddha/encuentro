import type {
  AssignRoomInput,
  CreateReservationInput,
  HotelForSelection,
  LodgingRepository,
  RegistrationForLodging,
  ReservationForAssignment,
  RoomForAssignment,
} from '@encuentro/application';
import {
  money,
  unlocksHotelSelection,
  type EventState,
  type LodgingPolicy,
  type LodgingState,
  type RegistrationState,
} from '@encuentro/domain';

import type { PrismaClient } from './prisma.js';

/**
 * Hospedaje contra la base — HOS-001 … HOS-017.
 *
 * Dos operaciones concentran todo el riesgo, y las dos son de concurrencia:
 *
 *  - **`hold`** decide el último cupo de un hotel. La capacidad es inventario
 *    —la suma de las habitaciones— y no un contador, así que entre leer la
 *    ocupación y escribir la reserva cabe otra persona. Se serializa con un
 *    cerrojo de aviso por hotel.
 *  - **`assignRoom`** libera una plaza y toma otra. HOS-005 exige que sea una
 *    sola transacción: a medias quedaría una plaza perdida —nadie la ocupa y
 *    nadie puede pedirla, porque el índice único la cree tomada— o duplicada.
 */

/** Cliente dentro de una transacción interactiva de Prisma. */
type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const VIVAS = ['HELD', 'CONFIRMED'] as const;

export function createLodgingRepository(prisma: PrismaClient): LodgingRepository {
  return {
    async findPolicy(eventId: string): Promise<LodgingPolicy | null> {
      const fila = await prisma.eventLodgingPolicy.findUnique({
        where: { eventId },
        select: { eventId: true, nightCount: true, checkInDate: true, checkOutDate: true },
      });

      return fila;
    },

    async findRegistration(registrationId: string): Promise<RegistrationForLodging | null> {
      const fila = await prisma.registration.findUnique({
        where: { id: registrationId },
        select: {
          id: true,
          eventId: true,
          status: true,
          paymentMode: true,
          event: { select: { status: true, currency: true } },
          person: { select: { userId: true } },
          priceVersion: {
            select: {
              id: true,
              packageId: true,
              paymentMode: true,
              amount: true,
              currency: true,
              startsAt: true,
              endsAt: true,
              balanceDueAt: true,
              minPaymentPercent: true,
            },
          },
        },
      });

      if (fila === null) return null;

      /*
       * Lo **aplicado**, no lo declarado ni lo cobrado.
       *
       * REG-020 mide contra lo que ya bajó el saldo de esta inscripción, que
       * son las asignaciones de pago. Un pago aprobado pero sin repartir es
       * saldo a favor (DEC-008) y todavía no paga nada concreto; contarlo aquí
       * desbloquearía la elección de hotel con dinero que no está aplicado.
       */
      const asignado = await prisma.paymentAllocation.aggregate({
        where: { charge: { registrationId: fila.id } },
        _sum: { amount: true },
      });

      const aprobado = money(asignado._sum.amount?.toString() ?? '0.00', fila.event.currency);

      return {
        id: fila.id,
        eventId: fila.eventId,
        eventStatus: fila.event.status as EventState,
        status: fila.status as RegistrationState,
        paymentMode: fila.paymentMode === 'ADVANCE' ? 'ADVANCE' : 'ARRIVAL',
        ownerUserId: fila.person.userId,
        /*
         * La regla vive en el dominio y aquí solo se le dan los datos.
         * `unlocksHotelSelection` exige `ADVANCE` y compara contra el mínimo de
         * la versión de precio, que es configurable por paquete (PKG-013): el
         * 50 % de referencia no aparece en este archivo ni debe aparecer.
         */
        unlockedByPayment: unlocksHotelSelection(
          {
            id: fila.priceVersion.id,
            packageId: fila.priceVersion.packageId,
            paymentMode: fila.priceVersion.paymentMode === 'ADVANCE' ? 'ADVANCE' : 'ARRIVAL',
            amount: money(fila.priceVersion.amount.toString(), fila.priceVersion.currency),
            ...(fila.priceVersion.startsAt === null
              ? {}
              : { startsAt: fila.priceVersion.startsAt }),
            ...(fila.priceVersion.endsAt === null ? {} : { endsAt: fila.priceVersion.endsAt }),
            ...(fila.priceVersion.balanceDueAt === null
              ? {}
              : { balanceDueAt: fila.priceVersion.balanceDueAt }),
            ...(fila.priceVersion.minPaymentPercent === null
              ? {}
              : { minPaymentPercent: fila.priceVersion.minPaymentPercent }),
          },
          aprobado,
        ),
      };
    },

    async listHotels(eventId: string): Promise<readonly HotelForSelection[]> {
      const hoteles = await prisma.hotel.findMany({
        where: { eventId },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          eventId: true,
          name: true,
          status: true,
          rooms: { where: { status: 'ACTIVE' }, select: { capacity: true } },
          _count: { select: { reservations: { where: { status: { in: [...VIVAS] } } } } },
        },
      });

      return hoteles.map((hotel) => ({
        id: hotel.id,
        eventId: hotel.eventId,
        name: hotel.name,
        active: hotel.status === 'ACTIVE',
        /*
         * Solo las habitaciones activas cuentan como inventario. Una fuera de
         * servicio sigue existiendo —sus reservas pasadas la referencian— pero
         * no ofrece plazas, y sumarla anunciaría camas que nadie puede ocupar.
         */
        capacity: hotel.rooms.reduce((total, sala) => total + sala.capacity, 0),
        live: hotel._count.reservations,
      }));
    },

    async findLiveReservation(registrationId: string): Promise<ReservationForAssignment | null> {
      const fila = await prisma.reservation.findFirst({
        where: { registrationId, status: { in: [...VIVAS] } },
        select: RESERVA,
      });

      return fila === null ? null : aReserva(fila);
    },

    async hold(input: CreateReservationInput) {
      return await prisma.$transaction(async (tx) => {
        /*
         * Serializa las reservas de **este** hotel.
         *
         * Sin el cerrojo, dos personas que piden la última plaza leen las dos
         * «queda una» y las dos entran: el índice único de camas no las detiene
         * porque un `HELD` todavía no tiene cama asignada —la asigna Hospedaje
         * (HOS-001)—, así que no hay ninguna restricción de base que choque.
         *
         * Es de transacción: se libera al terminar, pase lo que pase. Y es por
         * hotel, no global: dos personas eligiendo hoteles distintos no tienen
         * por qué esperarse.
         */
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.hotelId}))`;

        const capacidad = await tx.room.aggregate({
          where: { hotelId: input.hotelId, status: 'ACTIVE' },
          _sum: { capacity: true },
        });

        const vivas = await tx.reservation.count({
          where: { hotelId: input.hotelId, status: { in: [...VIVAS] } },
        });

        // La comprobación que decide de verdad. La del caso de uso sirve para
        // dar un mensaje antes de abrir esta transacción; esta es la que cuenta.
        if (vivas >= (capacidad._sum.capacity ?? 0)) return null;

        const reserva = await tx.reservation.create({
          data: {
            eventId: input.eventId,
            registrationId: input.registrationId,
            hotelId: input.hotelId,
            checkInDate: input.checkInDate,
            checkOutDate: input.checkOutDate,
            nightCount: input.nightCount,
            status: 'HELD',
            heldUntil: input.heldUntil,
          },
          select: { id: true },
        });

        await auditar(tx, {
          eventId: input.eventId,
          reservationId: reserva.id,
          actorId: input.actorId,
          action: 'lodging.hold',
          after: {
            status: 'HELD',
            hotelId: input.hotelId,
            nightCount: input.nightCount,
            heldUntil: input.heldUntil.toISOString(),
          },
        });

        return { reservationId: reserva.id };
      });
    },

    async findReservationForAssignment(
      reservationId: string,
    ): Promise<ReservationForAssignment | null> {
      const fila = await prisma.reservation.findUnique({
        where: { id: reservationId },
        select: RESERVA,
      });

      return fila === null ? null : aReserva(fila);
    },

    async findRoom(
      roomId: string,
      excludingReservationId: string | null,
    ): Promise<RoomForAssignment | null> {
      const habitacion = await prisma.room.findUnique({
        where: { id: roomId },
        select: {
          id: true,
          hotelId: true,
          code: true,
          capacity: true,
          status: true,
          reservations: {
            where: {
              status: { in: [...VIVAS] },
              bedIndex: { not: null },
              ...(excludingReservationId === null ? {} : { id: { not: excludingReservationId } }),
            },
            select: { bedIndex: true },
          },
        },
      });

      if (habitacion === null) return null;

      return {
        id: habitacion.id,
        hotelId: habitacion.hotelId,
        code: habitacion.code,
        capacity: habitacion.capacity,
        active: habitacion.status === 'ACTIVE',
        takenBeds: habitacion.reservations.flatMap((r) =>
          r.bedIndex === null ? [] : [r.bedIndex],
        ),
      };
    },

    async assignRoom(input: AssignRoomInput): Promise<boolean> {
      return await prisma.$transaction(async (tx) => {
        const antes = await tx.reservation.findUnique({
          where: { id: input.reservationId },
          select: { eventId: true, status: true, roomId: true, bedIndex: true },
        });

        if (antes === null) return false;

        /*
         * Una sola escritura hace las tres cosas: libera la plaza anterior,
         * toma la nueva y confirma. HOS-005 pide exactamente eso, y `updateMany`
         * con compare-and-swap sobre versión y estado lo consigue sin pasar por
         * un estado intermedio en el que la reserva no tenga plaza.
         *
         * `heldUntil` se pone a nulo porque el CHECK de la base lo exige fuera
         * de `HELD` (DEC-005): dejarlo puesto en una reserva confirmada
         * invitaría a que un worker la expirara, que es lo que HOS-012 prohíbe.
         */
        const actualizado = await tx.reservation.updateMany({
          where: {
            id: input.reservationId,
            version: input.expectedVersion,
            status: { in: [...VIVAS] },
          },
          data: {
            roomId: input.roomId,
            bedIndex: input.bedIndex,
            status: 'CONFIRMED',
            heldUntil: null,
            version: { increment: 1 },
          },
        });

        if (actualizado.count === 0) return false;

        await auditar(tx, {
          eventId: antes.eventId,
          reservationId: input.reservationId,
          actorId: input.actorId,
          action:
            input.overrideReason === null ? 'lodging.assign_room' : 'lodging.override_capacity',
          ...(input.overrideReason === null ? {} : { reason: input.overrideReason }),
          before: { status: antes.status, roomId: antes.roomId, bedIndex: antes.bedIndex },
          after: { status: 'CONFIRMED', roomId: input.roomId, bedIndex: input.bedIndex },
        });

        return true;
      });
    },
  };
}

const RESERVA = {
  id: true,
  eventId: true,
  registrationId: true,
  hotelId: true,
  status: true,
  roomId: true,
  bedIndex: true,
  version: true,
  event: { select: { status: true } },
} as const;

function aReserva(fila: {
  id: string;
  eventId: string;
  registrationId: string;
  hotelId: string;
  status: string;
  roomId: string | null;
  bedIndex: number | null;
  version: number;
  event: { status: string };
}): ReservationForAssignment {
  return {
    id: fila.id,
    eventId: fila.eventId,
    eventStatus: fila.event.status as EventState,
    registrationId: fila.registrationId,
    hotelId: fila.hotelId,
    status: fila.status as LodgingState,
    roomId: fila.roomId,
    bedIndex: fila.bedIndex,
    version: fila.version,
  };
}

/**
 * Rastro de la reserva — GOV-005, HOS-001, HOS-006.
 *
 * `eventId` va siempre: la pantalla de auditoría filtra por gestión, y las tres
 * escrituras del módulo de pagos aparecían en ninguna parte justo por
 * olvidarlo. La sobreasignación se registra con su propia acción y su motivo,
 * porque HOS-006 pide poder distinguirla de una asignación corriente sin leer
 * el detalle.
 */
async function auditar(
  tx: TransactionClient,
  entrada: {
    eventId: string;
    reservationId: string;
    actorId: string;
    action: string;
    reason?: string;
    before?: object;
    after: object;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      eventId: entrada.eventId,
      actorId: entrada.actorId,
      action: entrada.action,
      entity: 'reservation',
      entityId: entrada.reservationId,
      ...(entrada.reason === undefined ? {} : { reason: entrada.reason }),
      ...(entrada.before === undefined ? {} : { beforeRedacted: entrada.before }),
      afterRedacted: entrada.after,
    },
  });
}
