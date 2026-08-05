import { acceptsRegistrationsAndPayments, dayNumber, totalDays } from '@encuentro/domain';
import { Card, EmptyState, PageHeader, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';

import { UnauthenticatedNotice } from '@/components/unauthenticated-notice';
import { eventRepository } from '@/lib/container';

export const metadata: Metadata = { title: 'Dashboard' };

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ eventCode: string }>;
}) {
  const { eventCode } = await params;
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Dashboard" />
        <EmptyState title={`No existe la gestión ${eventCode}`} />
      </div>
    );
  }

  const days = totalDays(event.startAt, event.endAt);
  const today = dayNumber(event.startAt, event.endAt, new Date());
  const open = acceptsRegistrationsAndPayments(event.status);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={event.name}
        description={`Gestión ${event.code} · ${String(event.year)}`}
        actions={<StatusBadge tone={open ? 'success' : 'neutral'}>{event.status}</StatusBadge>}
      />

      <UnauthenticatedNotice />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs tracking-wide uppercase">Duración</p>
          <p className="font-mono text-3xl">{days}</p>
          <p className="text-sm">días, calculados desde las fechas configuradas</p>
        </Card>

        <Card>
          <p className="text-xs tracking-wide uppercase">Día actual</p>
          <p className="font-mono text-3xl">{today ?? '—'}</p>
          <p className="text-sm">
            {today === null
              ? 'Fuera del rango del evento'
              : `de ${String(days)}. El día no altera el precio (REG-006).`}
          </p>
        </Card>

        <Card>
          <p className="text-xs tracking-wide uppercase">Inscripciones y pagos</p>
          <p className="text-3xl">{open ? 'Habilitados' : 'No habilitados'}</p>
          <p className="text-sm">
            {open
              ? 'ACTIVE e IN_PROGRESS mantienen la operación completa (GOV-003).'
              : 'Solo ACTIVE e IN_PROGRESS los habilitan.'}
          </p>
        </Card>
      </div>

      <EmptyState
        title="Indicadores operativos pendientes"
        description="Inscripciones, pagos, hospedaje y entregas aparecerán aquí conforme se implementen sus módulos."
      />
    </div>
  );
}
