import { EmptyState, PageHeader, ScrollableTable, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';

import { eventRepository, registrationRepository } from '@/lib/container';
import { requirePermission } from '@/lib/session';

export const metadata: Metadata = { title: 'Inscripciones' };

export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
} as const;

export default async function RegistrationsPage({
  params,
}: {
  params: Promise<{ eventCode: string }>;
}) {
  const { eventCode } = await params;
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Inscripciones" />
        <EmptyState title={`No existe la gestión ${eventCode}`} />
      </div>
    );
  }

  await requirePermission('registration.read', { type: 'EVENT', eventId: event.id });

  const items = await registrationRepository().listByEvent(event.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Inscripciones · ${event.name}`}
        description={`${String(items.length)} inscripciones registradas.`}
      />

      {items.length === 0 ? (
        <EmptyState
          title="Todavía no hay inscripciones"
          description="Aparecerán aquí conforme se registren desde el portal o presencialmente."
        />
      ) : (
        <ScrollableTable label="Listado de inscripciones">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-ink)]/20 text-left">
                <th scope="col" className="p-3">
                  Código
                </th>
                <th scope="col" className="p-3">
                  Modalidad
                </th>
                <th scope="col" className="p-3">
                  Estado
                </th>
                <th scope="col" className="p-3">
                  Asistencia
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[var(--color-ink)]/10">
                  <td className="p-3 font-mono">{item.code}</td>
                  <td className="p-3">
                    {item.paymentMode === 'ADVANCE' ? 'Anticipado' : 'Al llegar'}
                  </td>
                  <td className="p-3">
                    {/* Los cuatro estados son canónicos y un CHECK en la base
                        impide cualquier otro, así que el índice siempre resuelve. */}
                    <StatusBadge tone={STATUS_TONE[item.status as keyof typeof STATUS_TONE]}>
                      {item.status}
                    </StatusBadge>
                  </td>
                  <td className="p-3">{item.attendanceStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      )}
    </div>
  );
}
