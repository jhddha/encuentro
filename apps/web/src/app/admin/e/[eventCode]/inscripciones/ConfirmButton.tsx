'use client';

import { Button } from '@encuentro/ui';
import { useState, useTransition } from 'react';

import { confirmRegistrationAction } from './actions';

/**
 * Botón para confirmar una inscripción — REG-017.
 *
 * Es cliente porque necesita estado: mientras la acción viaja hay que impedir un
 * segundo envío, y si el dominio rechaza hay que mostrar por qué sin recargar.
 *
 * El rechazo más probable **no es un error de quien pulsa** sino una carrera: la
 * aprobación de un pago confirma por su cuenta cuando el saldo llega a cero, y
 * puede haber ocurrido con esta pantalla abierta. Por eso el mensaje aparece
 * junto al botón y la bandeja se revalida sola.
 */
export function ConfirmButton({
  eventCode,
  registrationId,
  version,
}: {
  readonly eventCode: string;
  readonly registrationId: string;
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
            const result = await confirmRegistrationAction(eventCode, registrationId, version);
            if (!result.ok) setError(result.message);
          });
        }}
      >
        {pending ? 'Confirmando…' : 'Confirmar'}
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
