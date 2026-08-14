'use server';

import { registerExchangeRate, savePolicy } from '@encuentro/application';
import { revalidatePath } from 'next/cache';

import { runAction, type ActionResult } from '@/lib/actions';
import { eventRepository, exchangeRateRepository, lodgingConfigRepository } from '@/lib/container';
import { requireActor } from '@/lib/session';

/**
 * Registro de la tasa de cambio del día — DEC-009.
 *
 * La autorización no se comprueba aquí: la exige el caso de uso con
 * `accounting.exchange_rate.manage`, que es donde vive la regla. Esta capa
 * resuelve el actor y traduce el fallo del dominio a algo que la pantalla pueda
 * decir.
 */
function texto(valor: FormDataEntryValue | null): string {
  return typeof valor === 'string' ? valor : '';
}

export async function registerRateAction(
  eventCode: string,
  eventId: string,
  form: FormData,
): Promise<ActionResult> {
  const actor = await requireActor();

  const resultado = await runAction(async () => {
    await registerExchangeRate(
      { rates: exchangeRateRepository(), actor },
      {
        eventId,
        currency: texto(form.get('moneda')).toUpperCase(),
        rate: texto(form.get('tasa')),
        effectiveOn: texto(form.get('dia')),
        actorId: actor.userId,
      },
    );
  });

  if (resultado.ok) {
    revalidatePath(`/admin/e/${eventCode}/configuracion`);
  }

  return resultado;
}

/**
 * Política de noches de hospedaje — HOS-011, HOS-014.
 *
 * Vive en Configuración de gestión porque el requisito lo sitúa aquí, y en
 * Hospedaje solo se lee: dos formularios sobre el mismo dato son dos formas de
 * dejarlo distinto.
 *
 * La autorización es `lodging.manage`, que la exige el caso de uso.
 */
export async function savePolicyAction(eventCode: string, form: FormData): Promise<ActionResult> {
  const actor = await requireActor();

  const result = await runAction(async () => {
    const event = await eventRepository().findByCode(eventCode);

    if (event === null) {
      throw new Error(`No existe la gestión ${eventCode}.`);
    }

    await savePolicy({ config: lodgingConfigRepository() }, actor, event.id, {
      // El número llega como texto; un `NaN` lo rechaza el dominio con «debe
      // tener al menos una noche», que es el mensaje correcto.
      nightCount: Number.parseInt(texto(form.get('noches')), 10),
      checkInDate: texto(form.get('entrada')),
      checkOutDate: texto(form.get('salida')),
    });
  });

  if (result.ok) {
    revalidatePath(`/admin/e/${eventCode}/configuracion`);
    revalidatePath(`/admin/e/${eventCode}/hospedaje`);
  }

  return result;
}
