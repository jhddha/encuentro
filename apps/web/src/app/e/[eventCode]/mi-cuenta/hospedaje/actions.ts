'use server';

import { chooseHotel } from '@encuentro/application';
import { DomainError } from '@encuentro/domain';
import { revalidatePath } from 'next/cache';

import { runAction, type ActionResult } from '@/lib/actions';
import { clock, eventRepository, lodgingRepository, myLodging } from '@/lib/container';
import { requireActor } from '@/lib/session';

/**
 * Elección de hotel por el peregrino — HOS-015, HOS-016.
 *
 * Ni la gestión ni la inscripción llegan del formulario. La gestión se resuelve
 * por el código de la URL y la inscripción **por el usuario de la sesión**:
 * aceptar un identificador de inscripción dejaría que cualquiera reservara
 * —o gastara la última plaza— contra la inscripción de otra persona. La
 * titularidad la vuelve a comprobar el caso de uso; esto es comodidad, no la
 * garantía.
 */
export async function chooseHotelAction(eventCode: string, hotelId: string): Promise<ActionResult> {
  const actor = await requireActor();

  const result = await runAction(async () => {
    const event = await eventRepository().findByCode(eventCode);

    if (event === null) {
      throw new Error(`No existe la gestión ${eventCode}.`);
    }

    const mio = await myLodging(event.id, actor.userId);

    if (mio === null) {
      throw new DomainError(
        'FORBIDDEN',
        'No consta ninguna inscripción suya en esta gestión. Inscríbase antes de elegir hotel.',
      );
    }

    await chooseHotel({ lodging: lodgingRepository(), clock: clock() }, actor, {
      eventId: event.id,
      registrationId: mio.registrationId,
      hotelId,
    });
  });

  revalidatePath(`/e/${eventCode}/mi-cuenta/hospedaje`);
  revalidatePath(`/e/${eventCode}/mi-cuenta`);

  return result;
}
