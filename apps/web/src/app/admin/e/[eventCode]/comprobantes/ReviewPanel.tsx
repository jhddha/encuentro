'use client';

import { Button } from '@encuentro/ui';
import { useState, useTransition } from 'react';

import { approveProofAction, rejectProofAction, requestCorrectionAction } from './actions';

/**
 * Panel de revisión de una evidencia — PAY-025, PAY-026, PAY-020.
 *
 * Vive dentro de la ruta de la bandeja, seleccionado por parámetro de consulta,
 * porque `contracts/routes.json` declara treinta y una rutas exactas y una
 * página fuera del contrato es una divergencia. Añadir una ruta de detalle es un
 * cambio de contrato, no una decisión de implementación.
 *
 * El reparto entre cargos se introduce a mano en vez de repartirse solo. Un
 * reparto automático parece cómodo hasta que asigna a un cargo que el peregrino
 * no quería pagar todavía, y deshacerlo exige anular el comprobante ya emitido.
 */

interface Charge {
  readonly id: string;
  readonly concept: string;
  readonly outstanding: string;
}

const CONCEPT_LABEL: Readonly<Record<string, string>> = {
  PACKAGE: 'Paquete',
  LODGING: 'Hospedaje',
  TRANSPORT: 'Transporte',
};

export function ReviewPanel({
  eventCode,
  proofId,
  version,
  declaredAmount,
  currency,
  charges,
}: {
  readonly eventCode: string;
  readonly proofId: string;
  readonly version: number;
  readonly declaredAmount: string;
  readonly currency: string;
  readonly charges: readonly Charge[];
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(operation: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await operation();
      if (!result.ok) setError(result.message ?? 'No se pudo completar la operación.');
    });
  }

  const allocations = charges
    .map((charge) => ({ chargeId: charge.id, amount: amounts[charge.id] ?? '' }))
    .filter((allocation) => allocation.amount.trim() !== '');

  return (
    <section
      aria-labelledby="revision-titulo"
      className="flex flex-col gap-4 border border-[var(--color-ink)]/20 p-4"
    >
      <h2 id="revision-titulo" className="text-lg font-semibold">
        Revisar evidencia
      </h2>

      <p className="text-sm">
        Importe declarado: <strong className="tabular-nums">{declaredAmount}</strong> {currency}
      </p>

      {charges.length === 0 ? (
        <p className="text-sm">
          Esta inscripción no tiene cargos pendientes. Aprobar dejará el importe completo como saldo
          a favor.
        </p>
      ) : (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-semibold">Reparto entre cargos</legend>

          {charges.map((charge) => (
            <div key={charge.id} className="flex flex-col gap-1">
              <label htmlFor={`monto-${charge.id}`} className="text-sm">
                {CONCEPT_LABEL[charge.concept] ?? charge.concept} — pendiente{' '}
                <span className="tabular-nums">{charge.outstanding}</span> {currency}
              </label>
              <input
                id={`monto-${charge.id}`}
                name={`monto-${charge.id}`}
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                className="border border-[var(--color-ink)]/40 p-2 text-sm tabular-nums"
                value={amounts[charge.id] ?? ''}
                onChange={(event) => {
                  setAmounts((current) => ({ ...current, [charge.id]: event.target.value }));
                }}
              />
            </div>
          ))}

          <p className="text-xs opacity-80">
            Lo que no se reparta queda como saldo a favor del peregrino. No se devuelve dinero.
          </p>
        </fieldset>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="motivo" className="text-sm">
          Motivo — obligatorio para rechazar o pedir corrección
        </label>
        <textarea
          id="motivo"
          name="motivo"
          rows={2}
          className="border border-[var(--color-ink)]/40 p-2 text-sm"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() => {
            run(() => approveProofAction(eventCode, proofId, version, currency, allocations));
          }}
        >
          {pending ? 'Procesando…' : 'Aprobar y emitir comprobante'}
        </Button>

        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            run(() => requestCorrectionAction(eventCode, proofId, version, reason));
          }}
        >
          Pedir corrección
        </Button>

        <Button
          variant="danger"
          disabled={pending}
          onClick={() => {
            run(() => rejectProofAction(eventCode, proofId, version, reason));
          }}
        >
          Rechazar
        </Button>
      </div>
    </section>
  );
}
