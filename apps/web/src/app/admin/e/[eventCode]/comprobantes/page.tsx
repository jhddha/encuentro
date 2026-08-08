import { EmptyState, PageHeader, ScrollableTable, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';

import { eventRepository, proofsPendingReview } from '@/lib/container';
import { requirePermission } from '@/lib/session';

import { TakeForReviewButton } from './TakeForReviewButton';

export const metadata: Metadata = { title: 'Comprobantes' };

export const dynamic = 'force-dynamic';

/**
 * Bandeja de evidencias pendientes de revisión — PAY-025, PAY-026.
 *
 * Muestra solo lo que requiere acción. Una evidencia aprobada o rechazada ya no
 * espera a nadie, y dejarlas aquí llenaría de ruido la única pantalla donde el
 * equipo mira qué falta por hacer.
 *
 * Desde aquí solo se **toma** una evidencia para revisarla. Aprobar o rechazar
 * exige ver el archivo adjunto y decidir el reparto entre cargos, así que vive
 * en su propia pantalla: meter esa decisión en una fila de tabla invita a
 * aprobar sin haber mirado el comprobante.
 */
const STATUS_TONE = {
  SUBMITTED: 'info',
  UNDER_REVIEW: 'warning',
} as const;

const STATUS_LABEL = {
  SUBMITTED: 'Enviada',
  UNDER_REVIEW: 'En revisión',
} as const;

const CHANNEL_LABEL: Readonly<Record<string, string>> = {
  BOLIVIA_QR_MANUAL: 'QR Bolivia',
  US_ACCOUNT_MANUAL: 'Cuenta EE. UU.',
  US_PAYMENT_LINK_MANUAL: 'Enlace EE. UU.',
  CASH: 'Efectivo',
  CASH_QR: 'QR en caja',
};

export default async function ReceiptsPage({ params }: { params: Promise<{ eventCode: string }> }) {
  const { eventCode } = await params;
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Comprobantes" />
        <EmptyState title={`No existe la gestión ${eventCode}`} />
      </div>
    );
  }

  await requirePermission('payment.proof.review', { type: 'EVENT', eventId: event.id });

  const items = await proofsPendingReview(event.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Comprobantes · ${event.name}`}
        description={
          items.length === 0
            ? 'Sin evidencias pendientes de revisión.'
            : `${String(items.length)} evidencias esperan revisión.`
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="No hay nada pendiente"
          description="Las evidencias aparecerán aquí en cuanto los peregrinos suban sus comprobantes."
        />
      ) : (
        <ScrollableTable label="Evidencias pendientes de revisión">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-ink)]/20 text-left">
                <th scope="col" className="p-3">
                  Inscripción
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
                  Fecha de pago
                </th>
                <th scope="col" className="p-3">
                  Estado
                </th>
                <th scope="col" className="p-3">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[var(--color-ink)]/10">
                  <td className="p-3 font-mono">{item.registrationCode}</td>
                  {/*
                    El importe es el **declarado** por el peregrino, no uno
                    confirmado: PAY-025 dice que subir una evidencia no confirma
                    nada. La columna lo nombra así para que nadie lo lea como
                    dinero recibido.
                  */}
                  <td className="p-3 tabular-nums">
                    {item.declaredAmount} {item.currency}
                  </td>
                  <td className="p-3">{CHANNEL_LABEL[item.channelCode] ?? item.channelCode}</td>
                  <td className="p-3 font-mono">{item.reference}</td>
                  <td className="p-3">
                    {/*
                      NFR-013: se guarda en UTC y se muestra en la zona de la
                      gestión, nunca en la del servidor.
                    */}
                    {item.paidAt.toLocaleDateString('es', { timeZone: event.timezone })}
                  </td>
                  <td className="p-3">
                    <StatusBadge tone={STATUS_TONE[item.status as keyof typeof STATUS_TONE]}>
                      {STATUS_LABEL[item.status as keyof typeof STATUS_LABEL]}
                    </StatusBadge>
                  </td>
                  <td className="p-3">
                    {item.status === 'SUBMITTED' ? (
                      <TakeForReviewButton
                        eventCode={eventCode}
                        proofId={item.id}
                        version={item.version}
                      />
                    ) : (
                      /*
                        Ya está tomada. Aprobar o rechazar exige ver el archivo y
                        decidir el reparto entre cargos, así que vive en su propia
                        pantalla y no en una fila de tabla.
                      */
                      <span className="text-xs opacity-70">En manos de un revisor</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      )}
    </div>
  );
}
