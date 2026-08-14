import type { HotelState, LodgingConfigRepository, RoomState } from '@encuentro/application';

import type { PrismaClient } from './prisma.js';

/**
 * Inventario y política de hospedaje contra la base — HOS-011, HOS-014.
 *
 * Va aparte de `lodging-repository.ts` porque son dos trabajos con dos ritmos
 * distintos: aquel decide el último cupo bajo concurrencia y este configura la
 * gestión antes de que haya nadie reservando. Mezclarlos habría metido cerrojos
 * y transacciones en operaciones que no los necesitan.
 *
 * `hotels` y `rooms` no tienen columna de versión, así que dos ediciones
 * simultáneas del mismo hotel se pisan y gana la última. Es aceptable —es
 * configuración que toca una persona antes del evento, no dinero— y lo que sí
 * está protegido es lo que importa: la capacidad no puede bajar por debajo de
 * lo ocupado, y eso se comprueba con la ocupación leída en el momento.
 */

const VIVAS = ['HELD', 'CONFIRMED'] as const;

export function createLodgingConfigRepository(prisma: PrismaClient): LodgingConfigRepository {
  return {
    async findHotel(hotelId: string): Promise<HotelState | null> {
      const fila = await prisma.hotel.findUnique({
        where: { id: hotelId },
        select: {
          id: true,
          eventId: true,
          name: true,
          _count: { select: { reservations: { where: { status: { in: [...VIVAS] } } } } },
        },
      });

      return fila === null
        ? null
        : { id: fila.id, eventId: fila.eventId, name: fila.name, live: fila._count.reservations };
    },

    async findRoom(roomId: string): Promise<RoomState | null> {
      const fila = await prisma.room.findUnique({
        where: { id: roomId },
        select: {
          id: true,
          hotelId: true,
          code: true,
          hotel: { select: { eventId: true } },
          _count: { select: { reservations: { where: { status: { in: [...VIVAS] } } } } },
        },
      });

      return fila === null
        ? null
        : {
            id: fila.id,
            hotelId: fila.hotelId,
            eventId: fila.hotel.eventId,
            code: fila.code,
            occupied: fila._count.reservations,
          };
    },

    async hotelBelongsTo(hotelId: string, eventId: string): Promise<boolean> {
      return (await prisma.hotel.count({ where: { id: hotelId, eventId } })) > 0;
    },

    async saveHotel({ eventId, hotel, actorId }): Promise<string> {
      return await prisma.$transaction(async (tx) => {
        const datos = {
          code: hotel.code,
          name: hotel.name,
          address: hotel.address,
          status: hotel.active ? 'ACTIVE' : 'INACTIVE',
        };

        const fila =
          hotel.id === null
            ? await tx.hotel.create({ data: { eventId, ...datos }, select: { id: true } })
            : await tx.hotel.update({
                where: { id: hotel.id },
                data: datos,
                select: { id: true },
              });

        await tx.auditLog.create({
          data: {
            eventId,
            actorId,
            action: hotel.id === null ? 'lodging.hotel.create' : 'lodging.hotel.update',
            entity: 'hotel',
            entityId: fila.id,
            afterRedacted: datos,
          },
        });

        return fila.id;
      });
    },

    async saveRoom({ eventId, room, actorId }): Promise<string> {
      return await prisma.$transaction(async (tx) => {
        const datos = {
          code: room.code,
          capacity: room.capacity,
          status: room.active ? 'ACTIVE' : 'INACTIVE',
        };

        const fila =
          room.id === null
            ? await tx.room.create({
                data: { hotelId: room.hotelId, ...datos },
                select: { id: true },
              })
            : await tx.room.update({ where: { id: room.id }, data: datos, select: { id: true } });

        await tx.auditLog.create({
          data: {
            eventId,
            actorId,
            action: room.id === null ? 'lodging.room.create' : 'lodging.room.update',
            entity: 'room',
            entityId: fila.id,
            afterRedacted: { ...datos, hotelId: room.hotelId },
          },
        });

        return fila.id;
      });
    },

    async savePolicy({ eventId, policy, actorId }): Promise<void> {
      await prisma.$transaction(async (tx) => {
        const datos = {
          nightCount: policy.nightCount,
          checkInDate: policy.checkInDate,
          checkOutDate: policy.checkOutDate,
        };

        /*
         * `upsert` sobre `event_id`, que es único: HOS-014 pide **una sola
         * fuente**, así que la política no se versiona en filas nuevas sino que
         * se corrige en la suya. El histórico de quién la cambió vive en
         * auditoría, que es donde no se puede reescribir.
         */
        const fila = await tx.eventLodgingPolicy.upsert({
          where: { eventId },
          update: { ...datos, version: { increment: 1 } },
          create: { eventId, ...datos },
          select: { id: true, version: true },
        });

        await tx.auditLog.create({
          data: {
            eventId,
            actorId,
            action: 'lodging.policy.save',
            entity: 'event_lodging_policy',
            entityId: fila.id,
            afterRedacted: {
              nightCount: policy.nightCount,
              checkInDate: policy.checkInDate.toISOString().slice(0, 10),
              checkOutDate: policy.checkOutDate.toISOString().slice(0, 10),
              version: fila.version,
            },
          },
        });
      });
    },
  };
}
