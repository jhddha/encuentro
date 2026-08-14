'use server';

import { saveHotel, saveRoom } from '@encuentro/application';
import { revalidatePath } from 'next/cache';

import { runAction, type ActionResult } from '@/lib/actions';
import { eventRepository, lodgingConfigRepository } from '@/lib/container';
import { requireActor } from '@/lib/session';

/**
 * Alta y corrección del inventario de hospedaje — HOS-011.
 *
 * La autorización la exige el caso de uso con `lodging.manage`, que es distinto
 * de `lodging.assign_room`: cambiar la capacidad de una habitación mueve el
 * inventario de la gestión entera, y quien reparte camas a diario no tiene por
 * qué poder hacerlo.
 *
 * La gestión se resuelve por su código y no se acepta del formulario, igual que
 * en el resto de acciones administrativas.
 */

function texto(form: FormData, campo: string): string {
  const valor = form.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
}

async function resolverEventId(eventCode: string): Promise<string> {
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    throw new Error(`No existe la gestión ${eventCode}.`);
  }

  return event.id;
}

export async function saveHotelAction(eventCode: string, form: FormData): Promise<ActionResult> {
  const actor = await requireActor();

  const result = await runAction(async () => {
    const eventId = await resolverEventId(eventCode);
    const id = texto(form, 'id');
    const direccion = texto(form, 'direccion');

    await saveHotel({ config: lodgingConfigRepository() }, actor, eventId, {
      id: id === '' ? null : id,
      code: texto(form, 'codigo'),
      name: texto(form, 'nombre'),
      address: direccion === '' ? null : direccion,
      // Una casilla ausente en `FormData` es una casilla desmarcada.
      active: form.get('activo') !== null,
    });
  });

  revalidatePath(`/admin/e/${eventCode}/hospedaje`);
  return result;
}

export async function saveRoomAction(eventCode: string, form: FormData): Promise<ActionResult> {
  const actor = await requireActor();

  const result = await runAction(async () => {
    const eventId = await resolverEventId(eventCode);
    const id = texto(form, 'id');

    /*
     * La capacidad llega como texto y se interpreta aquí, dentro de
     * `runAction`: un `NaN` que llegara al dominio produciría «la capacidad
     * debe ser un entero», que es el mensaje correcto, y llega como aviso en
     * pantalla y no como error de servidor.
     */
    await saveRoom({ config: lodgingConfigRepository() }, actor, eventId, {
      id: id === '' ? null : id,
      hotelId: texto(form, 'hotelId'),
      code: texto(form, 'codigo'),
      capacity: Number.parseInt(texto(form, 'capacidad'), 10),
      active: form.get('activo') !== null,
    });
  });

  revalidatePath(`/admin/e/${eventCode}/hospedaje`);
  return result;
}
