import { can } from '@encuentro/domain';
import { EmptyState, PageHeader, ScrollableTable, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';

import { eventRepository, registrationsWithBalance } from '@/lib/container';
import { requirePermission } from '@/lib/session';

import { ConfirmButton } from './ConfirmButton';

export const metadata: Metadata = { title: 'Inscripciones' };

export const dynamic = 'force-dynamic';

/**
 * Bandeja de inscripciones — REG-017.
 *
 * Muestra el saldo junto al estado porque son la misma pregunta: `CONFIRMED`
 * exige saldo cero, y sin la cifra al lado el estado no se puede explicar.
 *
 * El botón de confirmar es **uno de los dos caminos** hacia `CONFIRMED`. El otro
 * es derivado: aprobar un pago que salda la cuenta confirma en su misma
 * transacción, así que lo normal es que esta columna esté vacía y el estado ya
 * diga «Confirmada». El botón cubre lo que el derivado no alcanza.
 */

const STATUS_TONE = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
} as const;

const STATUS_LABEL = {
  DRAFT: 'Borrador',
  SUBMITTED: 'Enviada',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
} as const;

const ATTENDANCE_LABEL: Readonly<Record<string, string>> = {
  NOT_ARRIVED: 'No ha llegado',
  CHECKED_IN: 'Registrada',
  NO_SHOW: 'No se presentó',
  COMPLETED: 'Completada',
};

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

  const actor = await requirePermission('registration.read', {
    type: 'EVENT',
    eventId: event.id,
  });

  /*
   * Leer no basta para confirmar. Quien solo tiene `registration.read` ve la
   * bandeja completa y no el botón — el caso de uso lo rechazaría igual, pero
   * ofrecer un botón que siempre falla es peor que no ofrecerlo.
   */
  const puedeConfirmar = can(actor, 'registration.update', {
    type: 'EVENT',
    eventId: event.id,
  });

  const items = await registrationsWithBalance(event.id);
  const pendientes = items.filter((item) => item.confirmation?.outcome === 'CONFIRM').length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Inscripciones · ${event.name}`}
        description={
          pendientes === 0
            ? `${String(items.length)} inscripciones registradas.`
            : `${String(items.length)} inscripciones · ${String(pendientes)} con el saldo cubierto esperando confirmación.`
        }
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
                  Cargos
                </th>
                <th scope="col" className="p-3">
                  Saldo
                </th>
                <th scope="col" className="p-3">
                  Estado
                </th>
                <th scope="col" className="p-3">
                  Asistencia
                </th>
                <th scope="col" className="p-3">
                  Acción
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
                  <td className="p-3 tabular-nums">
                    {item.charged} {item.currency}
                  </td>
                  <td className="p-3 tabular-nums">
                    {item.outstanding} {item.currency}
                  </td>
                  <td className="p-3">
                    {/* Los cuatro estados son canónicos y un CHECK en la base
                        impide cualquier otro, así que el índice siempre resuelve. */}
                    <StatusBadge tone={STATUS_TONE[item.status]}>
                      {STATUS_LABEL[item.status]}
                    </StatusBadge>
                  </td>
                  <td className="p-3">
                    {ATTENDANCE_LABEL[item.attendanceStatus] ?? item.attendanceStatus}
                  </td>
                  <td className="p-3">
                    {item.confirmation === null ? (
                      '—'
                    ) : item.confirmation.outcome === 'CONFIRM' ? (
                      puedeConfirmar ? (
                        <ConfirmButton
                          eventCode={eventCode}
                          registrationId={item.id}
                          version={item.version}
                        />
                      ) : (
                        'Lista para confirmar'
                      )
                    ) : (
                      /*
                        REG-017 dicho en voz alta: el pago parcial permanece
                        `SUBMITTED`. Sin esta frase, quien mira la bandeja no
                        sabe si falta dinero o falta que alguien pulse.
                      */
                      <span className="text-xs opacity-80">Falta saldo por cubrir</span>
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
