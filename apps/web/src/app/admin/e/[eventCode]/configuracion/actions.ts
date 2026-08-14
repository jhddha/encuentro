'use server';

import { registerExchangeRate } from '@encuentro/application';
import { revalidatePath } from 'next/cache';

import { runAction, type ActionResult } from '@/lib/actions';
import { exchangeRateRepository } from '@/lib/container';
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
