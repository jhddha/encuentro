'use server';

import { assignRoom } from '@encuentro/application';
import { revalidatePath } from 'next/cache';

import { runAction, type ActionResult } from '@/lib/actions';
import { clock, eventRepository, lodgingRepository } from '@/lib/container';
import { requireActor } from '@/lib/session';

/**
 * Asignación de habitación — HOS-001, HOS-005, HOS-006.
 *
 * La autorización la exige el caso de uso contra el dominio: `lodging.assign_room`
 * para asignar y `lodging.override_capacity` **solo** cuando la operación es una
 * sobreasignación. Aquí se resuelve el actor y se traduce el formulario.
 *
 * La gestión se resuelve por su código, no se acepta del formulario: el permiso
 * se comprueba contra ella, y aceptarla permitiría asignar habitaciones de otra
 * gestión presentando el identificador correcto.
 */
export async function assignRoomAction(
  eventCode: string,
  reservationId: string,
  expectedVersion: number,
  roomId: string,
  bedIndex: string,
  overrideReason: string,
): Promise<ActionResult> {
  const actor = await requireActor();

  return await terminar(eventCode, async (eventId) => {
    /*
     * La plaza es opcional: en blanco significa «la primera libre», que es lo
     * que quiere quien asigna en serie. Un texto que no sea un entero se trata
     * como ausente en vez de como cero, porque cero no es una plaza válida y el
     * rechazo hablaría de capacidad en vez de del dedo.
     */
    const plaza = Number.parseInt(bedIndex.trim(), 10);
    const motivo = overrideReason.trim();

    await assignRoom({ lodging: lodgingRepository(), clock: clock() }, actor, {
      eventId,
      reservationId,
      expectedVersion,
      roomId,
      ...(Number.isInteger(plaza) && plaza > 0 ? { bedIndex: plaza } : {}),
      ...(motivo === '' ? {} : { overrideReason: motivo }),
    });
  });
}

async function terminar(
  eventCode: string,
  operacion: (eventId: string) => Promise<void>,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    const event = await eventRepository().findByCode(eventCode);

    if (event === null) {
      throw new Error(`No existe la gestión ${eventCode}.`);
    }

    await operacion(event.id);
  });

  // Aunque falle: si otra persona se adelantó, la bandeja debe reflejarlo en
  // vez de seguir mostrando el estado que quien mira creía tener.
  revalidatePath(`/admin/e/${eventCode}/hospedaje`);

  return result;
}
