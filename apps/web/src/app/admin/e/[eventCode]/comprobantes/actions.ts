'use server';

import { reviewPaymentProof, takeProofForReview } from '@encuentro/application';
import { money } from '@encuentro/domain';
import { revalidatePath } from 'next/cache';

import { runAction, type ActionResult } from '@/lib/actions';
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

async function resolveEventId(eventCode: string): Promise<string> {
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    throw new Error(`No existe la gestión ${eventCode}.`);
  }

  return event.id;
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

export async function approveProofAction(
  eventCode: string,
  proofId: string,
  expectedVersion: number,
  currency: string,
  allocations: readonly AllocationForm[],
): Promise<ActionResult> {
  const actor = await requireActor();
  const eventId = await resolveEventId(eventCode);

  const result = await runAction(async () => {
    await reviewPaymentProof({ proofs: paymentProofRepository() }, actor, {
      eventId,
      proofId,
      expectedVersion,
      outcome: 'APPROVED',
      /*
       * `money()` valida el texto decimal y lanza `MONEY_INVALID` si no lo es.
       * Se construye aquí, dentro de `runAction`, para que un importe mal
       * escrito llegue al usuario como mensaje y no como pantalla de error.
       */
      allocations: allocations.map((allocation) => ({
        chargeId: allocation.chargeId,
        amount: money(allocation.amount, currency),
      })),
    });
  });

  revalidatePath(`/admin/e/${eventCode}/comprobantes`);
  return result;
}
