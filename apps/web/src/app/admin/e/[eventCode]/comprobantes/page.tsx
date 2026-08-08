import { EmptyState, PageHeader, ScrollableTable, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';

import { eventRepository, proofDetail, proofsPendingReview } from '@/lib/container';
import { requirePermission } from '@/lib/session';

import { ReviewPanel } from './ReviewPanel';
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
 * La revisión es un **panel en esta misma ruta**, seleccionado por parámetro de
 * consulta. No es una preferencia de diseño: `contracts/routes.json` declara
 * treinta y una rutas exactas y una prueba rechaza cualquier página fuera del
 * contrato. Añadir una ruta de detalle sería un cambio de contrato, no una
 * decisión de implementación.
 *
 * Aun así, aprobar no cabe en una fila de tabla: exige ver el archivo adjunto y
 * repartir entre cargos, y ponerlo en la fila invita a aprobar sin mirar.
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

export default async function ReceiptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventCode: string }>;
  searchParams: Promise<{ evidencia?: string }>;
}) {
  const { eventCode } = await params;
  const { evidencia } = await searchParams;
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

  /*
   * El detalle se comprueba contra la gestión de la URL. Sin eso, un
   * identificador de otra gestión mostraría su evidencia a quien solo tiene
   * permiso sobre esta.
   */
  const detalle =
    evidencia === undefined
      ? null
      : ((d) => (d?.eventId === event.id ? d : null))(await proofDetail(evidencia));

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

      {detalle !== null && detalle.status === 'UNDER_REVIEW' && (
        <ReviewPanel
          eventCode={eventCode}
          proofId={detalle.id}
          version={detalle.version}
          declaredAmount={detalle.declaredAmount}
          currency={detalle.currency}
          charges={detalle.charges}
        />
      )}

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
                      /* Ya tomada: abre el panel de revisión de esta ruta. */
                      <a
                        href={`/admin/e/${eventCode}/comprobantes?evidencia=${item.id}`}
                        className="text-sm underline"
                      >
                        Revisar
                      </a>
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
