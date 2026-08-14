'use client';

import { Button } from '@encuentro/ui';
import { useState, useTransition } from 'react';

import { chooseHotelAction } from './actions';

/**
 * Elección de hotel — HOS-015.
 *
 * **La pantalla no promete habitación.** El requisito lo dice literalmente, y
 * la razón es operativa: la habitación la asigna Hospedaje cuando cuadra
 * familias, edades y quién ronca, y una interfaz que dejara elegir número de
 * cama convertiría ese trabajo en una discusión.
 *
 * Las plazas que se muestran son de hace un instante. Se dice «disponibles
 * ahora» y no «reservadas para usted» porque quien decide el último cupo es la
 * base, dentro de un cerrojo, y entre ver la cifra y pulsar cabe otra persona.
 */

export interface HotelChoice {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly remaining: number;
}

export function HotelPicker({
  eventCode,
  hotels,
}: {
  readonly eventCode: string;
  readonly hotels: readonly HotelChoice[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function elegir(hotelId: string) {
    setError(null);
    setEligiendo(hotelId);

    startTransition(async () => {
      const resultado = await chooseHotelAction(eventCode, hotelId);

      if (!resultado.ok) setError(resultado.message);
      setEligiendo(null);
    });
  }

  const conPlazas = hotels.filter((hotel) => hotel.remaining > 0);

  if (hotels.length === 0) {
    return (
      <p className="text-sm">
        Esta gestión todavía no tiene hoteles configurados. Aparecerán aquí en cuanto la
        organización los cargue.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        Elija dónde quiere alojarse. <strong>La habitación la asigna Hospedaje</strong>, que reparte
        las plazas cuando están todas las inscripciones.
      </p>

      {error !== null && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          <span aria-hidden="true">✕ </span>
          {error}
        </p>
      )}

      {conPlazas.length === 0 && (
        <p className="text-sm">
          No quedan plazas en ningún hotel. Avise a la organización: puede haber alojamiento fuera
          de los hoteles cargados aquí.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {hotels.map((hotel) => (
          <li
            key={hotel.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-ink)]/20 p-4"
          >
            <div className="flex flex-col gap-1">
              <span className="font-medium">{hotel.name}</span>
              {hotel.address !== null && (
                <span className="text-xs opacity-70">{hotel.address}</span>
              )}
              <span className="text-xs opacity-70">
                {hotel.remaining === 0
                  ? 'Sin plazas'
                  : `${String(hotel.remaining)} ${hotel.remaining === 1 ? 'plaza disponible' : 'plazas disponibles'} ahora`}
              </span>
            </div>

            <Button
              disabled={pending || hotel.remaining === 0}
              onClick={() => {
                elegir(hotel.id);
              }}
            >
              {eligiendo === hotel.id ? 'Reservando…' : 'Elegir este hotel'}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
