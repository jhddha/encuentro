'use server';

import { reviewPaymentProof, takeProofForReview } from '@encuentro/application';
import { money } from '@encuentro/domain';
import { revalidatePath } from 'next/cache';

import { runAction, runActionWith, type ActionResult, type ActionResultWith } from '@/lib/actions';
import { eventRepository, paymentProofRepository } from '@/lib/container';
import { requireActor } from '@/lib/session';

/**
 * Acciones de la bandeja de comprobantes — PAY-025, PAY-026.
 *
 * La autorización la hace el caso de uso contra el dominio, no esta capa. Aquí
 * solo se resuelve el actor, se traduce el formulario y se revalida la pantalla.
 *
 * **La gestión se resuelve por su código, no se acepta del formulario.** Un
 * `eventId` que llegue del cliente es un `eventId` que el cliente puede cambiar,
 * y el permiso se comprueba contra él: aceptarlo permitiría revisar evidencias
 * de otra gestión presentando el identificador correcto.
 */

async function resolveEvent(eventCode: string): Promise<{ id: string; currency: string }> {
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    throw new Error(`No existe la gestión ${eventCode}.`);
  }

  return { id: event.id, currency: event.currency };
}

async function resolveEventId(eventCode: string): Promise<string> {
  return (await resolveEvent(eventCode)).id;
}

export async function takeForReviewAction(
  eventCode: string,
  proofId: string,
  expectedVersion: number,
): Promise<ActionResult> {
  const actor = await requireActor();
  const eventId = await resolveEventId(eventCode);

  const result = await runAction(async () => {
    await takeProofForReview({ proofs: paymentProofRepository() }, actor, {
      eventId,
      proofId,
      expectedVersion,
    });
  });

  // Aunque falle: si otro revisor se adelantó, la bandeja debe reflejarlo en vez
  // de seguir mostrando el estado que el usuario creía tener.
  revalidatePath(`/admin/e/${eventCode}/comprobantes`);

  return result;
}

export async function rejectProofAction(
  eventCode: string,
  proofId: string,
  expectedVersion: number,
  reason: string,
): Promise<ActionResult> {
  const actor = await requireActor();
  const eventId = await resolveEventId(eventCode);

  const result = await runAction(async () => {
    await reviewPaymentProof({ proofs: paymentProofRepository() }, actor, {
      eventId,
      proofId,
      expectedVersion,
      outcome: 'REJECTED',
      reason,
    });
  });

  revalidatePath(`/admin/e/${eventCode}/comprobantes`);
  return result;
}

export async function requestCorrectionAction(
  eventCode: string,
  proofId: string,
  expectedVersion: number,
  reason: string,
): Promise<ActionResult> {
  const actor = await requireActor();
  const eventId = await resolveEventId(eventCode);

  const result = await runAction(async () => {
    await reviewPaymentProof({ proofs: paymentProofRepository() }, actor, {
      eventId,
      proofId,
      expectedVersion,
      outcome: 'CORRECTION_REQUESTED',
      reason,
    });
  });

  revalidatePath(`/admin/e/${eventCode}/comprobantes`);
  return result;
}

export interface AllocationForm {
  readonly chargeId: string;
  /** Texto decimal, tal como viaja por el formulario. */
  readonly amount: string;
}

/**
 * Comprobante recién emitido, tal como lo recibe la pantalla — PAY-031.
 *
 * `verificationUrl` contiene el token en claro y **es lo único que existirá de
 * él**: la base guarda solo su HMAC. Si esta respuesta se pierde, el
 * comprobante queda emitido y sin forma de verificarse nunca.
 */
export interface IssuedReceiptView {
  readonly number: string;
  readonly verificationUrl: string;
}

/**
 * Aprueba y reparte.
 *
 * **La moneda del reparto no llega del cliente**, y antes sí. El panel enviaba
 * la de la evidencia, que en un cobro en dólares no es la de los cargos: el
 * reparto salía etiquetado en USD contra cargos en bolivianos. Peor que el
 * error en sí es de dónde venía el dato, porque el endpoint que Next genera
 * para una acción de servidor es invocable directamente y aceptaba cualquier
 * código de tres letras.
 *
 * Se resuelve aquí desde la gestión, que es donde vive: los libros se llevan en
 * una sola moneda y el reparto se anota en ella.
 */
export async function approveProofAction(
  eventCode: string,
  proofId: string,
  expectedVersion: number,
  allocations: readonly AllocationForm[],
): Promise<ActionResultWith<IssuedReceiptView | null>> {
  const actor = await requireActor();
  const { id: eventId, currency } = await resolveEvent(eventCode);

  const result = await runActionWith(async () => {
    const receipt = await reviewPaymentProof({ proofs: paymentProofRepository() }, actor, {
      eventId,
      proofId,
      expectedVersion,
      outcome: 'APPROVED',
      /*
       * `money()` valida el texto decimal y lanza `MONEY_INVALID` si no lo es.
       * Se construye aquí, dentro de `runActionWith`, para que un importe mal
       * escrito llegue al usuario como mensaje y no como pantalla de error.
       */
      allocations: allocations.map((allocation) => ({
        chargeId: allocation.chargeId,
        amount: money(allocation.amount, currency),
      })),
    });

    if (receipt === null) return null;

    /*
     * La URL se compone aquí y no en el cliente: `APP_URL` es la dirección
     * pública configurada, y el QR debe apuntar a ella y no a la que tenga el
     * navegador del revisor abierta —que en una red interna puede ser una IP
     * que fuera no resuelve.
     */
    const base = process.env.APP_URL ?? '';

    return {
      number: receipt.number,
      verificationUrl: `${base}/verificar/comprobante/${receipt.verificationToken}`,
    };
  });

  revalidatePath(`/admin/e/${eventCode}/comprobantes`);
  return result;
}
