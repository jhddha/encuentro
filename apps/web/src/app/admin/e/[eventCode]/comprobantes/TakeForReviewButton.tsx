'use client';

import { Button } from '@encuentro/ui';
import { useState, useTransition } from 'react';

import { takeForReviewAction } from './actions';

/**
 * Botón para tomar una evidencia y empezar a revisarla.
 *
 * Es cliente porque necesita estado: mientras la acción viaja hay que impedir un
 * segundo envío, y si el dominio rechaza hay que mostrar por qué sin recargar.
 *
 * El rechazo más probable no es un error del usuario sino una carrera: otro
 * revisor tomó la misma evidencia primero. Por eso el mensaje se muestra junto
 * al botón y la lista se revalida sola: quien lo lea verá el estado real en la
 * misma pantalla.
 */
export function TakeForReviewButton({
  eventCode,
  proofId,
  version,
}: {
  readonly eventCode: string;
  readonly proofId: string;
  readonly version: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await takeForReviewAction(eventCode, proofId, version);
            if (!result.ok) setError(result.message);
          });
        }}
      >
        {pending ? 'Tomando…' : 'Tomar para revisión'}
      </Button>

      {error !== null && (
        // `role="alert"` para que un lector de pantalla lo anuncie sin que el
        // foco tenga que llegar hasta aquí (WCAG 4.1.3).
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
