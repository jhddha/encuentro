import { civilDayIn, formatRate, totalDays } from '@encuentro/domain';
import {
  Card,
  EmptyState,
  PageHeader,
  ReadonlyState,
  ScrollableTable,
  StatusBadge,
} from '@encuentro/ui';
import type { Metadata } from 'next';

import { ExchangeRateForm } from './ExchangeRateForm';
import { eventRepository, exchangeRateRepository, prisma } from '@/lib/container';
import { requirePermission } from '@/lib/session';

export const metadata: Metadata = { title: 'Configuración de la gestión' };

export const dynamic = 'force-dynamic';

/**
 * Configuración de gestión (design-system.md §6).
 *
 * EVT-016 y EVT-016: el total de días se **calcula** a partir de `start_at` y
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

  /*
   * `event.read` basta porque esta pantalla solo muestra. Cuando gane la edición
   * de la configuración, esa mutación exigirá `event.update` por su cuenta: leer
   * y escribir son permisos distintos y no se cubren con el mismo.
   */
  await requirePermission('event.read', { type: 'EVENT', eventId: event.id });

  const days = totalDays(event.startAt, event.endAt);

  /*
   * Las monedas extranjeras salen de los canales de cobro activos, no de una
   * lista fija: si la gestión no cobra en dólares, no hay tasa que registrar y
   * el formulario lo dice en vez de ofrecer una moneda que nadie usa.
   */
  const canales = await prisma().paymentChannel.findMany({
    where: { eventId: event.id, active: true },
    select: { currency: true },
    distinct: ['currency'],
  });

  const monedasExtranjeras = canales
    .map((canal) => canal.currency)
    .filter((moneda) => moneda !== event.currency)
    .sort();

  const tasas = await exchangeRateRepository().listRecent(event.id, 10);

  // El día que se propone es el civil de la gestión, no el de quien mira: la
  // tasa es del día de allá (NFR-013).
  const hoy = civilDayIn(event.timezone, new Date());

  const fields = [
    { label: 'Código', value: event.code, note: 'Único, junto con el año (EVT-001).' },
    { label: 'Año', value: String(event.year), note: 'Una edición por año.' },
    {
      label: 'Inicio',
      value: event.startAt.toISOString(),
      note: 'Guardado en UTC; se presenta en la zona de la gestión.',
    },
    { label: 'Fin', value: event.endAt.toISOString(), note: 'Configurable (EVT-016).' },
    {
      label: 'Duración calculada',
      value: `${String(days)} días`,
      note: 'Derivada de las fechas. No hay ningún valor fijo en código (EVT-016).',
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

      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Tasa de cambio del día</h2>
          <p className="text-sm">
            Cierra TBD-001: sin una tasa registrada, un cobro en moneda extranjera se rechaza porque
            congelarla exigiría inventar el número.
          </p>
        </div>

        <ExchangeRateForm
          eventCode={event.code}
          eventId={event.id}
          functionalCurrency={event.currency}
          monedasExtranjeras={monedasExtranjeras}
          hoy={hoy}
        />

        {tasas.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Últimas registradas</h3>
            <ScrollableTable label="Tasas de cambio registradas">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-ink)]/15 text-left">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Día
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Tasa
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      La registró
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tasas.map((tasa) => (
                    <tr
                      key={`${tasa.effectiveOn}-${tasa.currency}`}
                      className="border-b border-[var(--color-ink)]/10"
                    >
                      <td className="py-2 pr-4 font-mono tabular-nums">{tasa.effectiveOn}</td>
                      <td className="py-2 pr-4 tabular-nums">
                        {formatRate(
                          { currency: tasa.currency, rateMicros: tasa.rateMicros },
                          event.currency,
                        )}
                      </td>
                      <td className="py-2">{tasa.registeredBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          </div>
        )}
      </Card>

      {/*
        Decía que la edición estaba «bloqueada por DEC-016». Esa decisión eligió
        Better Auth y se resolvió en P04: la sesión existe, y esta misma pantalla
        exige `event.read` para llegar hasta aquí. Lo que falta no es
        autenticación, es la acción de servidor que escriba la configuración con
        `event.update` — trabajo pendiente, no una decisión bloqueada.
      */}
      <ReadonlyState
        title="Edición no disponible"
        description="Falta la acción de servidor que guarda los cambios; exigirá el permiso event.update. La lógica de transición de estado y su auditoría ya están implementadas y probadas."
      />
    </div>
  );
}
