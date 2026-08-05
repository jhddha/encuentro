import { EmptyState, PageHeader, ScrollableTable } from '@encuentro/ui';
import type { Metadata } from 'next';

import { UnauthenticatedNotice } from '@/components/unauthenticated-notice';
import { eventRepository, prisma } from '@/lib/container';

export const metadata: Metadata = { title: 'Auditoría' };

export const dynamic = 'force-dynamic';

/**
 * Registro de auditoría de la gestión.
 *
 * GOV-005 y GOV-009: append-only, no se reescribe. La garantía la impone un
 * trigger en Postgres, no esta pantalla.
 *
 * Los payloads se muestran tal cual están almacenados: lo que se escribe ya
 * pasó por `redact`, así que aquí no queda PII por ocultar.
 */
export default async function AuditPage({ params }: { params: Promise<{ eventCode: string }> }) {
  const { eventCode } = await params;
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Auditoría" />
        <EmptyState title={`No existe la gestión ${eventCode}`} />
      </div>
    );
  }

  const entries = await prisma().auditLog.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      action: true,
      reason: true,
      beforeRedacted: true,
      afterRedacted: true,
      createdAt: true,
      actor: { select: { displayName: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Auditoría · ${event.name}`}
        description="Registro append-only. Las últimas 100 entradas."
      />

      <UnauthenticatedNotice />

      {entries.length === 0 ? (
        <EmptyState
          title="Sin movimientos registrados"
          description="Toda transición, alta o cambio sensible sobre esta gestión aparecerá aquí."
        />
      ) : (
        <ScrollableTable label="Registro de auditoría">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-ink)]/20 text-left">
                <th scope="col" className="p-3">
                  Fecha (UTC)
                </th>
                <th scope="col" className="p-3">
                  Acción
                </th>
                <th scope="col" className="p-3">
                  Actor
                </th>
                <th scope="col" className="p-3">
                  Antes
                </th>
                <th scope="col" className="p-3">
                  Después
                </th>
                <th scope="col" className="p-3">
                  Motivo
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-[var(--color-ink)]/10 align-top">
                  <td className="p-3 font-mono whitespace-nowrap">
                    <time dateTime={entry.createdAt.toISOString()}>
                      {entry.createdAt.toISOString().replace('T', ' ').slice(0, 19)}
                    </time>
                  </td>
                  <td className="p-3 font-mono">{entry.action}</td>
                  <td className="p-3">{entry.actor.displayName}</td>
                  <td className="p-3 font-mono text-xs">{JSON.stringify(entry.beforeRedacted)}</td>
                  <td className="p-3 font-mono text-xs">{JSON.stringify(entry.afterRedacted)}</td>
                  <td className="p-3">{entry.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      )}
    </div>
  );
}
