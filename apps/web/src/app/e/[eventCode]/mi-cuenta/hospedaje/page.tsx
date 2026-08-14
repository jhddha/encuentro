import { EmptyState, PageHeader, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { eventRepository, myLodging } from '@/lib/container';
import { requireActor } from '@/lib/session';

import { HotelPicker } from './HotelPicker';

export const metadata: Metadata = { title: 'Mi hospedaje' };

export const dynamic = 'force-dynamic';

/**
 * Hospedaje del peregrino — HOS-015, HOS-016, HOS-017.
 *
 * La inscripción se resuelve por el usuario de la sesión y no por un
 * identificador de la URL, igual que en pagos: la ruta solo lleva el código de
 * la gestión.
 *
 * **La pantalla no promete habitación** (HOS-015). Mientras Hospedaje no la
 * asigne, lo que se muestra es el hotel elegido y nada más.
 */

const TONE = {
  HELD: 'warning',
  CONFIRMED: 'success',
  RELEASED: 'neutral',
  CANCELLED: 'neutral',
  EXPIRED: 'danger',
} as const;

const LABEL = {
  HELD: 'Retenida',
  CONFIRMED: 'Confirmada',
  RELEASED: 'Liberada',
  CANCELLED: 'Anulada',
  EXPIRED: 'Vencida',
} as const;

export default async function PilgrimLodgingPage({
  params,
}: {
  params: Promise<{ eventCode: string }>;
}) {
  const { eventCode } = await params;
  const actor = await requireActor();
  const event = await eventRepository().findByCode(eventCode);

  if (event === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Mi hospedaje" />
        <EmptyState title={`No existe la gestión ${eventCode}`} />
      </div>
    );
  }

  const mio = await myLodging(event.id, actor.userId);

  if (mio === null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Mi hospedaje" />
        <EmptyState
          title="No consta ninguna inscripción suya"
          description="El hospedaje se elige desde una inscripción de esta gestión."
        />
      </div>
    );
  }

  const fecha = (valor: Date) =>
    valor.toLocaleDateString('es', { timeZone: event.timezone, dateStyle: 'long' });

  return (
    <div className="flex flex-col gap-6">
      {/*
        `exactOptionalPropertyTypes`: la propiedad se omite, no se pasa como
        indefinida. Son cosas distintas para el tipo, y la diferencia importa
        justo aquí, donde «no hay política configurada» no es «descripción
        vacía».
      */}
      <PageHeader
        title="Mi hospedaje"
        {...(mio.policy === null
          ? {}
          : {
              description: `${String(mio.policy.nightCount)} noches desde el ${fecha(mio.policy.checkInDate)}.`,
            })}
      />

      {/*
        HOS-017, dicho como información y no como impedimento. Quien paga al
        llegar no se queda sin hospedaje: se le asigna entre lo que quede. La
        pantalla no ofrece la elección porque reservarle por anticipado le
        quitaría la cama a alguien que ya pagó.
      */}
      {mio.paymentMode !== 'ADVANCE' && mio.reservation === null && (
        <EmptyState
          title="Su alojamiento se asigna al llegar"
          description="La modalidad «pago al llegar» no reserva hotel por anticipado. Hospedaje le asignará alojamiento entre la disponibilidad restante cuando se registre."
        />
      )}

      {mio.reservation !== null && (
        <section
          aria-labelledby="reserva"
          className="flex flex-col gap-3 rounded-lg border border-[var(--color-ink)]/20 p-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="reserva" className="text-lg font-semibold">
              {mio.reservation.hotelName}
            </h2>
            <StatusBadge tone={TONE[mio.reservation.status]}>
              {LABEL[mio.reservation.status]}
            </StatusBadge>
          </div>

          {mio.reservation.hotelAddress !== null && (
            <p className="text-sm opacity-70">{mio.reservation.hotelAddress}</p>
          )}

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="font-semibold">Entrada</dt>
            <dd>{fecha(mio.reservation.checkInDate)}</dd>
            <dt className="font-semibold">Salida</dt>
            <dd>{fecha(mio.reservation.checkOutDate)}</dd>
            <dt className="font-semibold">Noches</dt>
            <dd className="tabular-nums">{mio.reservation.nightCount}</dd>
            <dt className="font-semibold">Habitación</dt>
            {/*
              HOS-015: mientras no esté asignada se dice quién la asigna, en vez
              de dejar un guion que parezca un dato que falta por su culpa.
            */}
            <dd>
              {mio.reservation.roomCode === null
                ? 'La asigna Hospedaje'
                : `${mio.reservation.roomCode}${mio.reservation.bedIndex === null ? '' : ` · plaza ${String(mio.reservation.bedIndex)}`}`}
            </dd>
          </dl>

          {/*
            DEC-005: la retención dura treinta minutos y después la libera un
            worker. Decir hasta cuándo es lo que convierte una cuenta atrás
            invisible en algo sobre lo que se puede actuar.
          */}
          {mio.reservation.status === 'HELD' && mio.reservation.heldUntil !== null && (
            <p className="text-sm">
              Su elección está retenida hasta las{' '}
              <strong>
                {mio.reservation.heldUntil.toLocaleTimeString('es', {
                  timeZone: event.timezone,
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>
              . Hospedaje la confirmará al asignarle habitación; si no llega a tiempo, la plaza
              vuelve a estar disponible y podrá elegir de nuevo.
            </p>
          )}
        </section>
      )}

      {mio.reservation === null && mio.paymentMode === 'ADVANCE' && (
        <section aria-labelledby="elegir" className="flex flex-col gap-3">
          <h2 id="elegir" className="text-lg font-semibold">
            Elegir hotel
          </h2>

          {mio.policy === null ? (
            <p className="text-sm">
              La organización todavía no ha configurado las fechas de hospedaje. Podrá elegir hotel
              en cuanto lo haga.
            </p>
          ) : (
            <HotelPicker eventCode={eventCode} hotels={mio.hotels} />
          )}

          <p className="text-sm">
            ¿Todavía no puede elegir?{' '}
            <Link href={`/e/${eventCode}/mi-cuenta/pagos`} className="underline">
              Revise sus pagos
            </Link>
            : la elección se habilita cuando está aprobado el mínimo de su modalidad.
          </p>
        </section>
      )}
    </div>
  );
}
