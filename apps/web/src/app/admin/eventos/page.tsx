import { totalDays } from '@encuentro/domain';
import { EmptyState, PageHeader, ScrollableTable, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { eventRepository } from '@/lib/container';

export const metadata: Metadata = { title: 'Gestiones' };

// Lee de la base en cada petición: prerenderizar en build congelaría el estado
// de las gestiones dentro del bundle.
export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  DRAFT: 'neutral',
  READY: 'info',
  ACTIVE: 'success',
  IN_PROGRESS: 'progress',
  OPERATIONALLY_CLOSED: 'warning',
  FINANCIALLY_CLOSED: 'warning',
  ARCHIVED: 'neutral',
} as const;

export default async function EventsPage() {
  const events = await eventRepository().list();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Gestiones"
        description="Cada gestión es una edición anual. Las transiciones son manuales y auditadas."
      />

      {events.length === 0 ? (
        <EmptyState
          title="Todavía no hay gestiones"
          description="La creación desde la interfaz llega junto con la autenticación (P04). Mientras tanto se crean por script o migración."
        />
      ) : (
        <ScrollableTable label="Listado de gestiones">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-ink)]/20 text-left">
                <th scope="col" className="p-3">
                  Código
                </th>
                <th scope="col" className="p-3">
                  Año
                </th>
                <th scope="col" className="p-3">
                  Nombre
                </th>
                <th scope="col" className="p-3">
                  Fechas
                </th>
                <th scope="col" className="p-3">
                  Días
                </th>
                <th scope="col" className="p-3">
                  Estado
                </th>
                <th scope="col" className="p-3">
                  Pública
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-[var(--color-ink)]/10">
                  <td className="p-3">
                    <Link
                      href={`/admin/e/${event.code}/dashboard`}
                      className="font-mono underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {event.code}
                    </Link>
                  </td>
                  <td className="p-3 font-mono">{event.year}</td>
                  <td className="p-3">{event.name}</td>
                  <td className="p-3">
                    <time dateTime={event.startAt.toISOString()}>
                      {event.startAt.toISOString().slice(0, 10)}
                    </time>
                    {' → '}
                    <time dateTime={event.endAt.toISOString()}>
                      {event.endAt.toISOString().slice(0, 10)}
                    </time>
                  </td>
                  {/* EVT-016: el total se calcula, no se almacena ni se fija. */}
                  <td className="p-3 font-mono">{totalDays(event.startAt, event.endAt)}</td>
                  <td className="p-3">
                    <StatusBadge tone={STATUS_TONE[event.status]}>{event.status}</StatusBadge>
                  </td>
                  <td className="p-3">{event.publiclyEnabled ? 'Sí' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      )}
    </div>
  );
}
