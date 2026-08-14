'use client';

import { Button } from '@encuentro/ui';
import { useState, useTransition } from 'react';

import { assignRoomAction } from './actions';

/**
 * Asignación de habitación — HOS-001, HOS-005, HOS-006.
 *
 * Un formulario por fila, y no un panel aparte: quien asigna lo hace en serie
 * sobre una lista, y obligar a abrir y cerrar un detalle por cada persona
 * convierte veinte asignaciones en cuarenta clics.
 *
 * El campo de motivo aparece solo cuando hace falta. Tenerlo siempre visible
 * enseñaría a rellenarlo, y HOS-006 quiere que sobreasignar se note.
 */

export interface RoomChoice {
  readonly id: string;
  readonly code: string;
  readonly capacity: number;
  readonly occupied: number;
}

export function AssignRoomForm({
  eventCode,
  reservationId,
  version,
  rooms,
  currentRoomCode,
}: {
  readonly eventCode: string;
  readonly reservationId: string;
  readonly version: number;
  readonly rooms: readonly RoomChoice[];
  readonly currentRoomCode: string | null;
}) {
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? '');
  const [bedIndex, setBedIndex] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const habitacion = rooms.find((sala) => sala.id === roomId);
  const llena = habitacion !== undefined && habitacion.occupied >= habitacion.capacity;

  /*
   * Se pide motivo cuando la habitación está llena o cuando se teclea una plaza
   * fuera de su capacidad. Es una previsión de lo que el dominio va a decidir,
   * no la decisión: quien manda es `assignRoom`, que lo vuelve a comprobar con
   * las plazas reales.
   */
  const plaza = Number.parseInt(bedIndex.trim(), 10);
  const fueraDeRango =
    habitacion !== undefined && Number.isInteger(plaza) && plaza > habitacion.capacity;
  const sobreasigna = llena || fueraDeRango;

  function enviar() {
    setError(null);

    startTransition(async () => {
      const resultado = await assignRoomAction(
        eventCode,
        reservationId,
        version,
        roomId,
        bedIndex,
        motivo,
      );

      if (!resultado.ok) setError(resultado.message);
      else setMotivo('');
    });
  }

  if (rooms.length === 0) {
    return <span className="text-xs opacity-70">El hotel no tiene habitaciones activas.</span>;
  }

  const input = 'min-h-[var(--size-touch-target)] border border-[var(--color-ink)]/40 p-2 text-sm';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`sala-${reservationId}`}>
          Habitación
        </label>
        <select
          id={`sala-${reservationId}`}
          value={roomId}
          onChange={(event) => {
            setRoomId(event.target.value);
          }}
          className={input}
        >
          {rooms.map((sala) => (
            <option key={sala.id} value={sala.id}>
              {sala.code} · {sala.occupied}/{sala.capacity}
              {sala.occupied >= sala.capacity ? ' (llena)' : ''}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor={`plaza-${reservationId}`}>
          Plaza, opcional
        </label>
        <input
          id={`plaza-${reservationId}`}
          type="text"
          inputMode="numeric"
          placeholder="Plaza"
          value={bedIndex}
          onChange={(event) => {
            setBedIndex(event.target.value);
          }}
          className={`${input} w-20 tabular-nums`}
        />

        <Button disabled={pending} onClick={enviar}>
          {pending ? 'Asignando…' : currentRoomCode === null ? 'Asignar' : 'Cambiar'}
        </Button>
      </div>

      {sobreasigna && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`motivo-${reservationId}`} className="text-xs font-semibold">
            <span aria-hidden="true">⚠ </span>
            Sobreasignación: exige permiso y motivo (HOS-006)
          </label>
          <input
            id={`motivo-${reservationId}`}
            type="text"
            value={motivo}
            onChange={(event) => {
              setMotivo(event.target.value);
            }}
            placeholder="Por qué se pone una plaza de más"
            className={`${input} w-full`}
          />
        </div>
      )}

      {error !== null && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
