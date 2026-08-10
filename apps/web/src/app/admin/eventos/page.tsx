import { can, totalDays } from '@encuentro/domain';
import { EmptyState, PageHeader, ScrollableTable, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { eventRepository } from '@/lib/container';
import { requireActor } from '@/lib/session';

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

/**
 * Listado de gestiones.
 *
 * No exige `event.read` global: **filtra por alcance**, que es lo que pide
 * IAM-010 —«los permisos se verifican en la aplicación y los repositorios
 * filtran por scope»— y lo que EVT-015 necesita, porque el selector de gestión
 * de los paneles privados sale de aquí.
 *
 * Negar en bloque a quien tiene `event.read` con alcance de gestión le habría
 * dejado sin puerta de entrada a la suya; devolver la lista entera le habría
 * enseñado ediciones que no le corresponden. Filtrar responde a las dos cosas.
 *
 * La pantalla no comprobaba nada: bastaba una cuenta con el correo verificado
 * para ver todas las gestiones y su estado.
 */
export default async function EventsPage() {
  const actor = await requireActor();

  /*
   * El filtro usa `can`, que es puro: una llamada por gestión y ninguna consulta
   * extra. Con `scopeCovers`, un alcance GLOBAL las alcanza todas y uno de
   * gestión solo la suya.
   */
  const events = (await eventRepository().list()).filter((event) =>
    can(actor, 'event.read', { type: 'EVENT', eventId: event.id }),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Gestiones"
        description="Cada gestión es una edición anual. Las transiciones son manuales y auditadas."
      />

      {events.length === 0 ? (
        <EmptyState
          title="No hay ninguna gestión que pueda ver"
          /*
            Dos situaciones caben aquí y el texto no debe elegir una: que no
            exista ninguna gestión, o que existan y ninguna esté en su alcance.
            Decir «todavía no hay gestiones» a quien sí las hay pero no le tocan
            sería afirmar algo falso, y además le confirmaría que no existen.

            El texto anterior además prometía la creación desde la interfaz
            «junto con la autenticación (P04)». P04 se entregó y la creación
            sigue sin existir.
          */
          description="Si esperaba encontrar alguna, puede que su rol no alcance esa gestión. Las gestiones se crean todavía por script o migración."
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
