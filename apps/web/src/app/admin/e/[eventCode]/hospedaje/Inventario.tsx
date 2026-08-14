'use client';

import { Button } from '@encuentro/ui';
import { useState, useTransition, type SyntheticEvent } from 'react';

import { saveHotelAction, saveRoomAction } from './inventario-actions';

/**
 * Inventario de hospedaje — HOS-011, HOS-002.
 *
 * Hoteles y sus habitaciones. Hasta hoy había que sembrarlos desde la base, así
 * que la fase 5 solo funcionaba si alguien abría `psql`.
 *
 * Se muestran también los **inactivos**, al revés que en la pantalla del
 * peregrino: aquí se administra lo que existe, no se ofrece lo reservable, y un
 * hotel retirado tiene que poder volver.
 */

export interface RoomView {
  readonly id: string;
  readonly code: string;
  readonly capacity: number;
  readonly occupied: number;
  readonly active: boolean;
}

export interface HotelView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly address: string | null;
  readonly active: boolean;
  readonly capacity: number;
  readonly live: number;
  readonly rooms: readonly RoomView[];
}

const input = 'min-h-[var(--size-touch-target)] border border-[var(--color-ink)]/40 p-2 text-sm';

function useEnviar(
  accion: (eventCode: string, form: FormData) => Promise<{ ok: boolean; message?: string }>,
) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function enviar(eventCode: string, event: SyntheticEvent<HTMLFormElement>, limpiar: boolean) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const formulario = event.currentTarget;

    setError(null);

    startTransition(async () => {
      const resultado = await accion(eventCode, form);

      if (!resultado.ok) setError(resultado.message ?? 'No se pudo guardar.');
      else if (limpiar) formulario.reset();
    });
  }

  return { error, pending, enviar };
}

function FormularioHotel({
  eventCode,
  hotel,
}: {
  readonly eventCode: string;
  readonly hotel: HotelView | null;
}) {
  const { error, pending, enviar } = useEnviar(saveHotelAction);
  const nuevo = hotel === null;

  return (
    <form
      onSubmit={(event) => {
        enviar(eventCode, event, nuevo);
      }}
      className="flex flex-wrap items-end gap-2"
    >
      {!nuevo && <input type="hidden" name="id" value={hotel.id} />}

      <div className="flex flex-col gap-1">
        <label htmlFor={`codigo-${hotel?.id ?? 'nuevo'}`} className="text-xs font-medium">
          Código
        </label>
        <input
          id={`codigo-${hotel?.id ?? 'nuevo'}`}
          name="codigo"
          required
          defaultValue={hotel?.code ?? ''}
          className={`${input} w-28 font-mono`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`nombre-${hotel?.id ?? 'nuevo'}`} className="text-xs font-medium">
          Nombre
        </label>
        <input
          id={`nombre-${hotel?.id ?? 'nuevo'}`}
          name="nombre"
          required
          defaultValue={hotel?.name ?? ''}
          className={`${input} w-56`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`direccion-${hotel?.id ?? 'nuevo'}`} className="text-xs font-medium">
          Dirección
        </label>
        <input
          id={`direccion-${hotel?.id ?? 'nuevo'}`}
          name="direccion"
          defaultValue={hotel?.address ?? ''}
          className={`${input} w-64`}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="activo" defaultChecked={hotel?.active ?? true} />
        Admite reservas
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? 'Guardando…' : nuevo ? 'Añadir hotel' : 'Guardar'}
      </Button>

      {error !== null && (
        <p role="alert" className="w-full text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </form>
  );
}

function FormularioHabitacion({
  eventCode,
  hotelId,
  room,
}: {
  readonly eventCode: string;
  readonly hotelId: string;
  readonly room: RoomView | null;
}) {
  const { error, pending, enviar } = useEnviar(saveRoomAction);
  const nueva = room === null;

  return (
    <form
      onSubmit={(event) => {
        enviar(eventCode, event, nueva);
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="hotelId" value={hotelId} />
      {!nueva && <input type="hidden" name="id" value={room.id} />}

      <label className="sr-only" htmlFor={`sala-codigo-${room?.id ?? hotelId}`}>
        Código de la habitación
      </label>
      <input
        id={`sala-codigo-${room?.id ?? hotelId}`}
        name="codigo"
        required
        placeholder="101"
        defaultValue={room?.code ?? ''}
        className={`${input} w-24 font-mono`}
      />

      <label className="sr-only" htmlFor={`sala-capacidad-${room?.id ?? hotelId}`}>
        Plazas
      </label>
      <input
        id={`sala-capacidad-${room?.id ?? hotelId}`}
        name="capacidad"
        type="text"
        inputMode="numeric"
        required
        placeholder="Plazas"
        defaultValue={room === null ? '' : String(room.capacity)}
        className={`${input} w-24 tabular-nums`}
      />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="activo" defaultChecked={room?.active ?? true} />
        En servicio
      </label>

      {/*
        Cuánta gente hay dentro. Es el dato que decide si la capacidad se puede
        bajar, y tenerlo delante evita el intento antes que el rechazo.
      */}
      {room !== null && room.occupied > 0 && (
        <span className="text-xs opacity-70">
          {room.occupied} {room.occupied === 1 ? 'ocupada' : 'ocupadas'}
        </span>
      )}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? '…' : nueva ? 'Añadir' : 'Guardar'}
      </Button>

      {error !== null && (
        <p role="alert" className="w-full text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </form>
  );
}

export function Inventario({
  eventCode,
  hotels,
}: {
  readonly eventCode: string;
  readonly hotels: readonly HotelView[];
}) {
  return (
    <section aria-labelledby="inventario" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="inventario" className="text-lg font-semibold">
          Inventario
        </h2>
        <p className="text-sm">
          Las plazas disponibles son la suma de las habitaciones <strong>en servicio</strong>. Un
          hotel o una habitación con gente dentro no se puede retirar: reasígnela primero.
        </p>
      </div>

      {hotels.map((hotel) => (
        <div
          key={hotel.id}
          className="flex flex-col gap-3 rounded-lg border border-[var(--color-ink)]/20 p-4"
        >
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 className="font-semibold">{hotel.name}</h3>
            <span className="text-xs opacity-70">
              {hotel.live}/{hotel.capacity} plazas ocupadas
              {hotel.active ? '' : ' · retirado del inventario'}
            </span>
          </div>

          <FormularioHotel eventCode={eventCode} hotel={hotel} />

          <div className="flex flex-col gap-2 border-t border-[var(--color-ink)]/10 pt-3">
            <h4 className="text-sm font-medium">
              Habitaciones {hotel.rooms.length === 0 && '— ninguna todavía'}
            </h4>

            {hotel.rooms.map((sala) => (
              <FormularioHabitacion
                key={sala.id}
                eventCode={eventCode}
                hotelId={hotel.id}
                room={sala}
              />
            ))}

            <FormularioHabitacion eventCode={eventCode} hotelId={hotel.id} room={null} />
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-[var(--color-ink)]/30 p-4">
        <h3 className="text-sm font-medium">Añadir un hotel</h3>
        <FormularioHotel eventCode={eventCode} hotel={null} />
      </div>
    </section>
  );
}
