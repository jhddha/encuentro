import { totalDays } from '@encuentro/domain';
import { Card, EmptyState, PageHeader, ReadonlyState, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';

import { UnauthenticatedNotice } from '@/components/unauthenticated-notice';
import { eventRepository } from '@/lib/container';

export const metadata: Metadata = { title: 'Configuración de la gestión' };

export const dynamic = 'force-dynamic';

/**
 * Configuración de gestión (design-system.md §6).
 *
 * EVT-007 y EVT-008: el total de días se **calcula** a partir de `start_at` y
 * `end_at`. La referencia son 8 días, pero el número que se ve aquí sale de las
 * fechas reales de la gestión: si alguien la configura con otra duración, esta
 * pantalla lo refleja sin tocar código.
 */
export default async function EventConfigurationPage({
  params,
}: {
  params: Promise<{ eventCode: string }>;
}) {
  const { eventCode } = await params;
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Configuración de la gestión" />
        <EmptyState
          title={`No existe la gestión ${eventCode}`}
          description="Compruebe el código en el listado de gestiones."
        />
      </div>
    );
  }

  const days = totalDays(event.startAt, event.endAt);

  const fields = [
    { label: 'Código', value: event.code, note: 'Único, junto con el año (EVT-001).' },
    { label: 'Año', value: String(event.year), note: 'Una edición por año.' },
    {
      label: 'Inicio',
      value: event.startAt.toISOString(),
      note: 'Guardado en UTC; se presenta en la zona de la gestión.',
    },
    { label: 'Fin', value: event.endAt.toISOString(), note: 'Configurable (EVT-007).' },
    {
      label: 'Duración calculada',
      value: `${String(days)} días`,
      note: 'Derivada de las fechas. No hay ningún valor fijo en código (EVT-008).',
    },
    {
      label: 'Zona horaria',
      value: event.timezone,
      note: 'Solo afecta a la presentación; el almacenamiento es UTC.',
    },
    {
      label: 'Moneda',
      value: event.currency,
      note: 'ISO 4217. Los importes usan decimal exacto, nunca float.',
    },
    { label: 'Versión', value: String(event.version), note: 'Control de concurrencia optimista.' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Configuración · ${event.name}`}
        description="Los valores son configurables por gestión. Ninguno está fijado en código."
        actions={<StatusBadge tone="neutral">{event.status}</StatusBadge>}
      />

      <UnauthenticatedNotice />

      <Card>
        <dl className="flex flex-col gap-5">
          {fields.map((field) => (
            <div key={field.label} className="flex flex-col gap-1">
              <dt className="text-sm font-medium">{field.label}</dt>
              <dd className="font-mono text-base break-all">{field.value}</dd>
              <dd className="text-sm">{field.note}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <ReadonlyState
        title="Edición no disponible"
        description="Modificar la configuración y ejecutar transiciones requiere sesión autenticada, bloqueada por DEC-016. La lógica de transición y su auditoría ya están implementadas y probadas."
      />
    </div>
  );
}
