'use server';

import { confirmRegistration } from '@encuentro/application';
import { revalidatePath } from 'next/cache';

import { runAction, type ActionResult } from '@/lib/actions';
import { eventRepository, registrationConfirmationRepository } from '@/lib/container';
import { requireActor } from '@/lib/session';

/**
 * Confirmación manual de una inscripción — REG-017.
 *
 * Es **uno de los dos caminos** hacia `CONFIRMED`. El otro es derivado: aprobar
 * un pago que deja el saldo en cero confirma en su misma transacción. Ambos
 * aplican `decideConfirmation`, la única política del dominio, y el
 * compare-and-swap resuelve quién llega primero.
 *
 * Este existe para lo que el derivado no alcanza: una inscripción cuyo saldo
 * llegó a cero por otra vía, o una que quedó sin confirmar porque el pago se
 * aprobó cuando la regla todavía no se aplicaba.
 *
 * La gestión se resuelve por su código, nunca del formulario: el permiso se
 * comprueba contra ella, y aceptarla del cliente permitiría confirmar
 * inscripciones de otra gestión presentando el identificador correcto.
 */
export async function confirmRegistrationAction(
  eventCode: string,
  registrationId: string,
  expectedVersion: number,
): Promise<ActionResult> {
  const actor = await requireActor();
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    throw new Error(`No existe la gestión ${eventCode}.`);
  }

  const result = await runAction(async () => {
    await confirmRegistration({ registrations: registrationConfirmationRepository() }, actor, {
      eventId: event.id,
      registrationId,
      expectedVersion,
    });
  });

  // Aunque falle: si el camino derivado se adelantó, la bandeja debe reflejarlo
  // en vez de seguir ofreciendo un botón que ya no hace nada.
  revalidatePath(`/admin/e/${eventCode}/inscripciones`);

  return result;
}
