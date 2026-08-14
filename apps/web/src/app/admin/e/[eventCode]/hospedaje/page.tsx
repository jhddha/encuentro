import { EmptyState, PageHeader, ScrollableTable, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';

import { eventRepository, lodgingAssignments, lodgingInventory } from '@/lib/container';
import { can, requirePermission } from '@/lib/session';

import { AssignRoomForm } from './AssignRoomForm';
import { Inventario } from './Inventario';

export const metadata: Metadata = { title: 'Hospedaje' };

export const dynamic = 'force-dynamic';

/**
 * Bandeja de Hospedaje — HOS-001, HOS-005, HOS-015.
 *
 * «El peregrino elige hotel; Hospedaje asigna habitación.» Esta es la segunda
 * mitad: una lista de quién eligió qué hotel y dónde ponerlo.
 *
 * Las retenidas van primero. Una `HELD` caduca a los treinta minutos (DEC-005),
 * así que quien lleva veinte esperando es a quien hay que atender; una
 * confirmada solo se toca para cambiarla de habitación y no corre prisa.
 */

const TONE = { HELD: 'warning', CONFIRMED: 'success' } as const;
const LABEL = { HELD: 'Retenida', CONFIRMED: 'Confirmada' } as const;

export default async function LodgingPage({ params }: { params: Promise<{ eventCode: string }> }) {
  const { eventCode } = await params;
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Hospedaje" />
        <EmptyState title={`No existe la gestión ${eventCode}`} />
      </div>
    );
  }

  await requirePermission('lodging.read', { type: 'EVENT', eventId: event.id });

  const { rows, rooms } = await lodgingAssignments(event.id);
  const retenidas = rows.filter((fila) => fila.status === 'HELD').length;

  /*
   * El inventario solo lo ve —y lo toca— quien puede administrarlo. Abrir la
   * pantalla es `lodging.read`; cambiar la capacidad de una habitación mueve el
   * inventario de la gestión entera y es `lodging.manage`.
   *
   * Esconder el formulario no autoriza nada: la acción de servidor vuelve a
   * comprobarlo. Lo que evita es ofrecer algo que va a rechazarse.
   */
  const administra = await can('lodging.manage', { type: 'EVENT', eventId: event.id });
  const inventario = administra ? await lodgingInventory(event.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Hospedaje · ${event.name}`}
        description={
          rows.length === 0
            ? 'Todavía nadie ha elegido hotel.'
            : `${String(rows.length)} reservas vivas, ${String(retenidas)} esperando habitación.`
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Sin reservas"
          description="Aparecerán aquí en cuanto los peregrinos con pago anticipado aprobado elijan hotel."
        />
      ) : (
        <ScrollableTable label="Reservas de hospedaje">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-ink)]/20 text-left">
                <th scope="col" className="p-3">
                  Inscripción
                </th>
                <th scope="col" className="p-3">
                  Peregrino
                </th>
                <th scope="col" className="p-3">
                  Hotel
                </th>
                <th scope="col" className="p-3">
                  Habitación
                </th>
                <th scope="col" className="p-3">
                  Estado
                </th>
                <th scope="col" className="p-3">
                  Asignar
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((fila) => (
                <tr key={fila.reservationId} className="border-b border-[var(--color-ink)]/10">
                  <td className="p-3 font-mono">{fila.registrationCode}</td>
                  <td className="p-3">{fila.personName}</td>
                  <td className="p-3">{fila.hotelName}</td>
                  <td className="p-3">
                    {fila.roomCode === null ? (
                      <span className="opacity-60">Sin asignar</span>
                    ) : (
                      <span className="tabular-nums">
                        {fila.roomCode}
                        {fila.bedIndex === null ? '' : ` · ${String(fila.bedIndex)}`}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <StatusBadge tone={TONE[fila.status]}>{LABEL[fila.status]}</StatusBadge>
                    {/*
                      DEC-005: cuánto le queda a la retención. Sin esta hora, la
                      bandeja no distingue la que caduca en dos minutos de la que
                      acaba de llegar.
                    */}
                    {fila.heldUntil !== null && (
                      <span className="block text-xs opacity-70">
                        hasta las{' '}
                        {fila.heldUntil.toLocaleTimeString('es', {
                          timeZone: event.timezone,
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {/*
                      Solo las habitaciones del hotel que esa persona eligió: la
                      reserva es de un hotel concreto y ofrecer las de otro
                      produciría un rechazo que quien asigna no entendería.
                    */}
                    <AssignRoomForm
                      eventCode={eventCode}
                      reservationId={fila.reservationId}
                      version={fila.version}
                      currentRoomCode={fila.roomCode}
                      rooms={rooms.filter((sala) => sala.hotelId === fila.hotelId)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      )}

      {administra && <Inventario eventCode={eventCode} hotels={inventario} />}
    </div>
  );
}
