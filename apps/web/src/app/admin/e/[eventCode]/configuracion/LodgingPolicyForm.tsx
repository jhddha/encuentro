'use client';

import { Button } from '@encuentro/ui';
import { useState, useTransition, type SyntheticEvent } from 'react';

import { savePolicyAction } from './actions';

/**
 * Política de noches — HOS-011, HOS-014.
 *
 * «Editable desde Configuración de gestión y visible en Hospedaje según
 * permiso; no hay dos valores en conflicto.» Por eso vive aquí y en Hospedaje
 * solo se lee: dos formularios sobre el mismo dato son dos formas de dejarlo
 * distinto.
 *
 * Las noches son un **dato configurado**, no un cálculo sobre las fechas. Las
 * siete de referencia no aparecen en el código, y el campo se pide aparte
 * precisamente para que la incoherencia entre lo declarado y lo que abarcan las
 * fechas se detecte al guardar y no al reservar.
 */

const inputClass =
  'min-h-[var(--size-touch-target)] rounded-md border border-[var(--color-ink)]/30 px-3 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]';

export function LodgingPolicyForm({
  eventCode,
  actual,
  reservasVivas,
}: {
  readonly eventCode: string;
  readonly actual: {
    readonly nightCount: number;
    readonly checkInDate: string;
    readonly checkOutDate: string;
  } | null;
  /** Reservas que ya usan estas fechas. Cambiarlas no las reescribe. */
  readonly reservasVivas: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pending, startTransition] = useTransition();

  function enviar(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setError(null);
    setGuardado(false);

    startTransition(async () => {
      const resultado = await savePolicyAction(eventCode, form);

      if (resultado.ok) setGuardado(true);
      else setError(resultado.message);
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <p className="text-sm">
        Las noches son un dato de la gestión, no se derivan de cuándo llegue cada persona (HOS-011).
        De aquí salen las fechas de <strong>todas</strong> las reservas.
      </p>

      {/*
        Cambiar la política no reescribe lo ya reservado: HOS-013 dice que una
        reserva no se recalcula sola. Decirlo antes de guardar es lo que evita
        una gestión con dos grupos de reservas de fechas distintas sin que nadie
        lo haya querido.
      */}
      {reservasVivas > 0 && (
        <p className="text-sm">
          <strong>Ya hay {reservasVivas} reservas con estas fechas.</strong> Cambiarlas ahora no las
          modifica: las nuevas usarán las fechas nuevas y las de antes conservarán las suyas.
        </p>
      )}

      {error !== null && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          <span aria-hidden="true">✕ </span>
          {error}
        </p>
      )}

      {guardado && (
        <p role="status" aria-live="polite" className="text-sm text-[var(--color-success)]">
          <span aria-hidden="true">✓ </span>
          Política guardada.
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="entrada" className="text-sm font-medium">
            Entrada
          </label>
          <input
            id="entrada"
            name="entrada"
            type="date"
            required
            defaultValue={actual?.checkInDate ?? ''}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="salida" className="text-sm font-medium">
            Salida
          </label>
          <input
            id="salida"
            name="salida"
            type="date"
            required
            defaultValue={actual?.checkOutDate ?? ''}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="noches" className="text-sm font-medium">
            Noches
          </label>
          <input
            id="noches"
            name="noches"
            type="text"
            inputMode="numeric"
            required
            placeholder="7"
            aria-describedby="noches-ayuda"
            defaultValue={actual === null ? '' : String(actual.nightCount)}
            className={`${inputClass} w-24 tabular-nums`}
          />
          <p id="noches-ayuda" className="text-xs">
            Debe coincidir con lo que abarcan las fechas.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? 'Guardando…' : 'Guardar la política'}
      </Button>
    </form>
  );
}
