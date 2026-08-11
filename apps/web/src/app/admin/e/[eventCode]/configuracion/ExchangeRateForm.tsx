'use client';

import { Button } from '@encuentro/ui';
import { useState, useTransition, type SyntheticEvent } from 'react';

import { registerRateAction } from './actions';

/**
 * Registro de la tasa de cambio del día — DEC-009, cierra TBD-001.
 *
 * La tasa la teclea una persona y no la trae una fuente web. El número acaba
 * impreso en un comprobante y sostiene una conciliación: cuando alguien lo
 * discuta dentro de seis meses, «lo dijo una página» no es una respuesta.
 * Registrada aquí queda quién y cuándo.
 *
 * El formulario vive dentro de la configuración de la gestión y no en una ruta
 * propia: `contracts/routes.json` declara treinta y una rutas exactas.
 */

const inputClass =
  'min-h-[var(--size-touch-target)] rounded-md border border-[var(--color-ink)]/30 px-3 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]';

export function ExchangeRateForm({
  eventCode,
  eventId,
  functionalCurrency,
  monedasExtranjeras,
  hoy,
}: {
  readonly eventCode: string;
  readonly eventId: string;
  readonly functionalCurrency: string;
  /** Monedas que la gestión cobra y que no son la funcional. */
  readonly monedasExtranjeras: readonly string[];
  /** Día civil de la gestión, no del navegador de quien mira. */
  readonly hoy: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function enviar(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const formulario = event.currentTarget;

    // `FormData.get` puede devolver un `File`; el día es texto y se comprueba
    // en vez de forzarlo con `String()`, que produciría «[object Object]».
    const dia = form.get('dia');
    const diaTexto = typeof dia === 'string' ? dia : '';

    setError(null);
    setGuardado(null);

    startTransition(async () => {
      const resultado = await registerRateAction(eventCode, eventId, form);

      if (!resultado.ok) {
        setError(resultado.message);
        return;
      }

      setGuardado(`Tasa registrada para el ${diaTexto}.`);
      formulario.reset();
    });
  }

  if (monedasExtranjeras.length === 0) {
    return (
      <p className="text-sm">
        Esta gestión solo cobra en {functionalCurrency}, así que no hay ninguna tasa que registrar.
        Aparecerá aquí en cuanto se active un canal de cobro en otra moneda.
      </p>
    );
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <p className="text-sm">
        La tasa se congela al cargar cada evidencia (DEC-009): cambiarla después no altera lo ya
        cobrado. Sin tasa del día, un cobro en moneda extranjera se rechaza.
      </p>

      {error !== null && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          <span aria-hidden="true">✕ </span>
          {error}
        </p>
      )}

      {guardado !== null && (
        <p role="status" aria-live="polite" className="text-sm text-[var(--color-success)]">
          <span aria-hidden="true">✓ </span>
          {guardado}
        </p>
      )}

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="dia" className="text-sm font-medium">
            Día
          </label>
          {/*
            Por omisión el día civil de la gestión, no el del navegador: quien
            registra puede estar en otra zona horaria y la tasa es del día de
            allá (NFR-013).
          */}
          <input
            id="dia"
            name="dia"
            type="date"
            required
            defaultValue={hoy}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="moneda" className="text-sm font-medium">
            Moneda
          </label>
          <select
            id="moneda"
            name="moneda"
            required
            defaultValue={monedasExtranjeras[0]}
            className={inputClass}
          >
            {monedasExtranjeras.map((moneda) => (
              <option key={moneda} value={moneda}>
                {moneda}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="tasa" className="text-sm font-medium">
            Equivale a
          </label>
          <div className="flex items-center gap-2">
            {/*
              `text` y no `number`: el campo numérico rechaza la coma decimal
              según la configuración del navegador, y aquí se escribe «6,96».
              La validación la hace el dominio, que admite las dos formas.
            */}
            <input
              id="tasa"
              name="tasa"
              type="text"
              inputMode="decimal"
              required
              placeholder="6,96"
              aria-describedby="tasa-ayuda"
              className={`${inputClass} w-32 tabular-nums`}
            />
            <span className="text-sm">{functionalCurrency}</span>
          </div>
          <p id="tasa-ayuda" className="text-xs">
            Cuánto vale una unidad. Hasta seis decimales; coma o punto.
          </p>
        </div>
      </div>

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? 'Guardando…' : 'Registrar la tasa'}
      </Button>
    </form>
  );
}
