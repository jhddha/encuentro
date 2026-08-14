import { civilDayIn } from '@encuentro/domain';
import { EmptyState, PageHeader, ScrollableTable, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { accountStatement, advanceChannels, eventRepository } from '@/lib/container';
import { requireActor } from '@/lib/session';

import { ProofUploadForm } from './ProofUploadForm';

export const metadata: Metadata = { title: 'Mis pagos' };

export const dynamic = 'force-dynamic';

/**
 * Pagos del peregrino — PAY-018, PAY-025, PAY-026.
 *
 * Es la mitad del circuito que faltaba. El revisor ya tenía bandeja y panel;
 * esto es de donde sale lo que revisa, y sin ello **nadie puede pagar por
 * anticipado**.
 *
 * La inscripción se resuelve por el usuario de la sesión, nunca por un
 * identificador de la URL: la ruta solo lleva el código de la gestión, y así una
 * persona no puede ver ni tocar el circuito de pago de otra.
 */

const STATUS_TONE = {
  SUBMITTED: 'info',
  UNDER_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CORRECTION_REQUESTED: 'warning',
  REPLACED: 'neutral',
  CANCELLED: 'neutral',
  PENDING_UPLOAD: 'neutral',
} as const;

const STATUS_LABEL = {
  SUBMITTED: 'Enviado',
  UNDER_REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  CORRECTION_REQUESTED: 'Requiere corrección',
  REPLACED: 'Sustituido',
  CANCELLED: 'Anulado',
  PENDING_UPLOAD: 'Sin comprobante',
} as const;

const CHANNEL_LABEL: Readonly<Record<string, string>> = {
  BOLIVIA_QR_MANUAL: 'QR Bolivia',
  US_ACCOUNT_MANUAL: 'Cuenta EE. UU.',
  US_PAYMENT_LINK_MANUAL: 'Enlace EE. UU.',
  CASH: 'Efectivo',
  CASH_QR: 'QR en caja',
};

export default async function PilgrimPaymentsPage({
  params,
}: {
  params: Promise<{ eventCode: string }>;
}) {
  const { eventCode } = await params;
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Mis pagos" />
        <EmptyState title={`No existe la gestión ${eventCode}`} />
      </div>
    );
  }

  const actor = await requireActor();
  const statement = await accountStatement(event.id, actor.userId);

  if (statement === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Mis pagos" />
        <EmptyState
          title="Todavía no está inscrito en esta gestión"
          description="Complete su inscripción y después podrá declarar sus pagos aquí."
          action={
            <Link href={`/e/${eventCode}/inscripcion`} className="text-sm underline">
              Ir a la inscripción
            </Link>
          }
        />
      </div>
    );
  }

  const channels = await advanceChannels(event.id);

  /*
   * Hoy en la zona de la gestión, no en la del servidor (NFR-013). Es el tope
   * del campo de fecha: un pago no puede haber ocurrido mañana.
   *
   * Sale de la misma función del dominio que usa la validación. Cuando eran dos
   * cálculos distintos, el formulario ofrecía «hoy» como fecha válida y el
   * dominio la rechazaba por futura durante las primeras horas del día.
   */
  const hoy = civilDayIn(event.timezone, new Date());

  /*
   * PAY-026: si el revisor pidió una corrección, eso es lo único que este
   * peregrino tiene que hacer. Se corrige la evidencia existente en vez de
   * cargar otra, porque la referencia bancaria es única por gestión y volver a
   * declararla como fila nueva chocaría contra el índice.
   */
  const porCorregir = statement.proofs.find((proof) => proof.status === 'CORRECTION_REQUESTED');

  const enCurso = statement.proofs.some(
    (proof) => proof.status === 'SUBMITTED' || proof.status === 'UNDER_REVIEW',
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mis pagos"
        description={`Inscripción ${statement.registrationCode} · saldo pendiente ${statement.outstanding} ${statement.currency}`}
        actions={
          <Link href={`/e/${eventCode}/mi-cuenta`} className="text-sm underline">
            Ver estado de cuenta
          </Link>
        }
      />

      {porCorregir === undefined ? (
        <ProofUploadForm
          eventCode={eventCode}
          currency={statement.currency}
          channels={channels}
          today={hoy}
        />
      ) : (
        <>
          {/*
            El color no es la señal: `design-system.md` §3 prohíbe depender solo
            de él, así que el aviso lo lleva el texto en negrita y el borde solo
            acompaña.
          */}
          <div
            role="alert"
            className="rounded-lg border-2 border-[var(--color-warning)] p-4 text-sm"
          >
            <strong>Le pidieron corregir un comprobante.</strong>
            {porCorregir.reviewReason !== null && <> Motivo: {porCorregir.reviewReason}</>}
          </div>

          <ProofUploadForm
            eventCode={eventCode}
            currency={statement.currency}
            channels={channels}
            today={hoy}
            correction={{ proofId: porCorregir.id, version: porCorregir.version }}
          />
        </>
      )}

      {enCurso && (
        <p className="text-sm">
          Tiene un comprobante esperando revisión. Puede declarar otro pago si transfirió más de una
          vez, pero no hace falta reenviar el mismo.
        </p>
      )}

      <section aria-labelledby="historial" className="flex flex-col gap-3">
        <h2 id="historial" className="text-lg font-semibold">
          Comprobantes declarados
        </h2>

        {statement.proofs.length === 0 ? (
          <EmptyState
            title="Todavía no ha declarado ningún pago"
            description="Cuando envíe un comprobante aparecerá aquí con su estado."
          />
        ) : (
          <ScrollableTable label="Comprobantes declarados">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-ink)]/20 text-left">
                  <th scope="col" className="p-3">
                    Fecha del pago
                  </th>
                  <th scope="col" className="p-3">
                    Importe declarado
                  </th>
                  <th scope="col" className="p-3">
                    Canal
                  </th>
                  <th scope="col" className="p-3">
                    Referencia
                  </th>
                  <th scope="col" className="p-3">
                    Estado
                  </th>
                  <th scope="col" className="p-3">
                    Motivo
                  </th>
                </tr>
              </thead>
              <tbody>
                {statement.proofs.map((proof) => (
                  <tr key={proof.id} className="border-b border-[var(--color-ink)]/10">
                    <td className="p-3">
                      {proof.paidAt.toLocaleDateString('es', { timeZone: event.timezone })}
                    </td>
                    {/*
                      Con la equivalencia debajo cuando transfirió en otra
                      moneda. Sus cargos están en la de la gestión, así que sin
                      esta línea no puede responder a la única pregunta que le
                      trae aquí: si lo que envió alcanza.
                    */}
                    <td className="p-3 tabular-nums">
                      {proof.declaredAmount} {proof.currency}
                      {proof.currency !== statement.currency && proof.bookedAmount !== null && (
                        <span className="block text-xs opacity-70">
                          ≈ {proof.bookedAmount} {statement.currency}
                        </span>
                      )}
                    </td>
                    <td className="p-3">{CHANNEL_LABEL[proof.channelCode] ?? proof.channelCode}</td>
                    <td className="p-3 font-mono">{proof.reference}</td>
                    <td className="p-3">
                      <StatusBadge tone={STATUS_TONE[proof.status]}>
                        {STATUS_LABEL[proof.status]}
                      </StatusBadge>
                    </td>
                    {/*
                      PAY-026 exige que la revisión registre el motivo. Mostrarlo
                      aquí es lo que convierte un rechazo en algo accionable en
                      vez de en un callejón sin salida.
                    */}
                    <td className="p-3">{proof.reviewReason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        )}
      </section>
    </div>
  );
}
