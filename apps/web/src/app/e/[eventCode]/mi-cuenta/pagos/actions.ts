'use server';

import { resubmitPaymentProof, submitPaymentProof } from '@encuentro/application';
import { DomainError, civilDayAnchor, money } from '@encuentro/domain';
import { revalidatePath } from 'next/cache';

import { runAction, type ActionResult } from '@/lib/actions';
import {
  accountStatement,
  clock,
  eventRepository,
  evidenceStore,
  exchangeRateRepository,
  proofSubmissionRepository,
} from '@/lib/container';
import { requireActor } from '@/lib/session';

/**
 * Carga y corrección de evidencias por el peregrino — PAY-018, PAY-025.
 *
 * Dos cosas **nunca** llegan del formulario, por la misma razón que en la
 * bandeja del revisor: la gestión se resuelve por el código de la URL, y la
 * inscripción se resuelve por el usuario de la sesión. Aceptar cualquiera de
 * los dos como campo permitiría cargar una evidencia contra la inscripción de
 * otra persona presentando su identificador, que es el IDOR clásico de una
 * pantalla de autoservicio.
 *
 * La titularidad la vuelve a comprobar el caso de uso contra el dominio
 * (`authorizeOwnership`). Resolverla aquí es una comodidad, no la garantía.
 */

interface Declaracion {
  readonly channelId: string;
  readonly amount: string;
  readonly paidAt: string;
  readonly reference: string;
  readonly payerName: string;
}

/**
 * Campo de texto del formulario.
 *
 * Un `FormData` puede traer un `File` en cualquier campo, y convertirlo con
 * `String()` daría «[object File]»: un importe o una referencia que parecen
 * texto y no lo son. Lo que no llega como cadena se descarta y el dominio lo
 * rechaza como campo ausente.
 */
function texto(form: FormData, campo: string): string {
  const valor = form.get(campo);
  return typeof valor === 'string' ? valor.trim() : '';
}

/**
 * Lee el formulario.
 *
 * Devuelve texto sin interpretar: `money()` y `Date` se construyen dentro de
 * `runAction`, para que un importe o una fecha mal escritos lleguen al peregrino
 * como mensaje y no como pantalla de error.
 */
function leerDeclaracion(form: FormData): Declaracion {
  return {
    channelId: texto(form, 'canal'),
    amount: texto(form, 'importe'),
    paidAt: texto(form, 'fecha'),
    reference: texto(form, 'referencia'),
    payerName: texto(form, 'pagador'),
  };
}

async function leerArchivo(form: FormData): Promise<{ body: Uint8Array; contentType: string }> {
  const archivo = form.get('comprobante');

  if (!(archivo instanceof File) || archivo.size === 0) {
    throw new DomainError(
      'PAYMENT_PROOF_NOT_SUBMITTABLE',
      'Adjunte el comprobante: una foto o un PDF del respaldo bancario (PAY-018).',
    );
  }

  return {
    body: new Uint8Array(await archivo.arrayBuffer()),
    // El navegador lo declara; el dominio lo valida contra la lista blanca y el
    // almacén lo vuelve a comprobar. Confiar en este valor sin más sería
    // aceptar que quien sube el archivo decida cómo se sirve después.
    contentType: archivo.type,
  };
}

/**
 * Convierte la fecha del formulario, que llega como `YYYY-MM-DD`.
 *
 * El anclaje lo hace `civilDayAnchor` del dominio, la misma función con la que
 * la página calcula el tope del campo. Tener dos formas de anclar un día ya
 * produjo un fallo: el tope se calculaba en la zona de la gestión y la
 * validación comparaba contra el instante UTC (NFR-013).
 */
function fechaDeclarada(texto: string): Date {
  const fecha = civilDayAnchor(texto);

  if (fecha === null) {
    throw new DomainError(
      'PAYMENT_PROOF_NOT_SUBMITTABLE',
      'Indique una fecha de pago válida (día, mes y año).',
    );
  }

  return fecha;
}

async function resolverContexto(eventCode: string) {
  const actor = await requireActor();
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    throw new Error(`No existe la gestión ${eventCode}.`);
  }

  const statement = await accountStatement(event.id, actor.userId);

  if (statement === null) {
    throw new DomainError(
      'FORBIDDEN',
      'No consta ninguna inscripción suya en esta gestión. Inscríbase antes de declarar un pago.',
    );
  }

  return { actor, event, statement };
}

function dependencias() {
  return {
    proofs: proofSubmissionRepository(),
    evidence: evidenceStore(),
    rates: exchangeRateRepository(),
    clock: clock(),
  };
}

export async function submitProofAction(eventCode: string, form: FormData): Promise<ActionResult> {
  const result = await runAction(async () => {
    const { actor, event, statement } = await resolverContexto(eventCode);
    const declaracion = leerDeclaracion(form);

    await submitPaymentProof(dependencias(), actor, {
      eventId: event.id,
      registrationId: statement.registrationId,
      channelId: declaracion.channelId,
      amount: money(declaracion.amount, statement.currency),
      paidAt: fechaDeclarada(declaracion.paidAt),
      reference: declaracion.reference,
      payerName: declaracion.payerName,
      upload: await leerArchivo(form),
    });
  });

  revalidatePath(`/e/${eventCode}/mi-cuenta/pagos`);
  revalidatePath(`/e/${eventCode}/mi-cuenta`);

  return result;
}

export async function resubmitProofAction(
  eventCode: string,
  proofId: string,
  expectedVersion: number,
  form: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () => {
    const { actor, event, statement } = await resolverContexto(eventCode);
    const declaracion = leerDeclaracion(form);

    /*
     * La evidencia debe estar en el estado de cuenta de quien la corrige. El
     * caso de uso lo vuelve a comprobar por titularidad; esto solo evita que un
     * identificador ajeno llegue siquiera a intentarlo.
     */
    if (!statement.proofs.some((proof) => proof.id === proofId)) {
      throw new DomainError('FORBIDDEN', 'La evidencia solicitada no está disponible.');
    }

    await resubmitPaymentProof(dependencias(), actor, {
      eventId: event.id,
      proofId,
      expectedVersion,
      amount: money(declaracion.amount, statement.currency),
      paidAt: fechaDeclarada(declaracion.paidAt),
      reference: declaracion.reference,
      payerName: declaracion.payerName,
      upload: await leerArchivo(form),
    });
  });

  revalidatePath(`/e/${eventCode}/mi-cuenta/pagos`);
  revalidatePath(`/e/${eventCode}/mi-cuenta`);

  return result;
}
