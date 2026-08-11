'use client';

import { Button } from '@encuentro/ui';
import { useState, useTransition } from 'react';

import {
  approveProofAction,
  rejectProofAction,
  requestCorrectionAction,
  type IssuedReceiptView,
} from './actions';

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
  status,
  version,
  declaredAmount,
  currency,
  charges,
  reference,
  payerName,
  evidenceUrl,
  checksum,
}: {
  readonly eventCode: string;
  readonly proofId: string;
  /**
   * Estado de la evidencia, como *propiedad* y no como condición de montaje.
   *
   * La página renderiza este panel siempre que haya evidencia seleccionada. Si
   * el filtro viviera fuera, aprobar lo desmontaría —la revalidación devuelve la
   * evidencia ya APPROVED— y React se llevaría con él el estado `issued`, que
   * es el único lugar del sistema donde existe el token en claro.
   */
  readonly status: string;
  readonly version: number;
  readonly declaredAmount: string;
  readonly currency: string;
  readonly charges: readonly Charge[];
  readonly reference: string;
  readonly payerName: string | null;
  /** URL firmada y caduca. Nula si el peregrino no adjuntó archivo. */
  readonly evidenceUrl: string | null;
  readonly checksum: string | null;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedReceiptView | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(operation: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await operation();
      if (!result.ok) setError(result.message ?? 'No se pudo completar la operación.');
    });
  }

  /**
   * Aprobar, aparte del resto.
   *
   * Es la única decisión que **devuelve algo que no se puede volver a pedir**:
   * el token en claro del comprobante. La base guarda solo su HMAC, así que si
   * esta respuesta se descarta, el comprobante queda emitido y su QR ya no se
   * puede imprimir nunca.
   */
  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approveProofAction(eventCode, proofId, version, currency, allocations);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setIssued(result.value);
    });
  }

  const allocations = charges
    .map((charge) => ({ chargeId: charge.id, amount: amounts[charge.id] ?? '' }))
    .filter((allocation) => allocation.amount.trim() !== '');

  const revisable = status === 'UNDER_REVIEW';

  /*
   * Devolver `null` no desmonta: el componente sigue en el árbol y conserva su
   * estado. Por eso el panel puede dejar de mostrar el formulario en cuanto la
   * evidencia sale de revisión sin perder el comprobante recién emitido.
   */
  if (!revisable && issued === null) return null;

  return (
    <section
      aria-labelledby="revision-titulo"
      className="flex flex-col gap-4 border border-[var(--color-ink)]/20 p-4"
    >
      <h2 id="revision-titulo" className="text-lg font-semibold">
        {issued === null ? 'Revisar evidencia' : 'Comprobante emitido'}
      </h2>

      {/*
        El enlace de verificación aparece **una sola vez**, aquí. DEC-003: el
        valor en claro solo existe en el QR impreso, y la base guarda su HMAC.
        Recargar esta pantalla no lo recupera, y nadie puede reemitirlo sin
        anular el comprobante (PAY-033).

        Va antes del formulario, no después, porque al aprobar el formulario
        desaparece y este bloque queda solo.
      */}
      {issued !== null && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-2 rounded-lg border-2 border-[var(--color-success)] p-4"
        >
          <p className="text-sm">
            <strong>Comprobante {issued.number} emitido.</strong> Copie o imprima ahora el enlace de
            verificación: no se puede volver a mostrar.
          </p>

          <code className="text-xs break-all select-all">{issued.verificationUrl}</code>

          {/*
            Un botón y no solo texto seleccionable: es un valor irrecuperable, y
            una selección a mano fallida cuesta un comprobante muerto. Si el
            navegador niega el portapapeles —contexto no seguro—, el texto de
            arriba sigue ahí y se dice que copie a mano.
          */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(issued.verificationUrl).then(
                  () => {
                    setCopiado(true);
                  },
                  () => {
                    setCopiado(false);
                  },
                );
              }}
            >
              Copiar el enlace
            </Button>

            <span aria-live="polite" className="text-xs">
              {copiado ? 'Copiado al portapapeles.' : 'Si el botón no responde, cópielo a mano.'}
            </span>
          </div>
        </div>
      )}

      {revisable && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="font-semibold">Importe declarado</dt>
            <dd className="tabular-nums">
              {declaredAmount} {currency}
            </dd>
            <dt className="font-semibold">Referencia</dt>
            <dd className="font-mono">{reference}</dd>
            <dt className="font-semibold">Pagador</dt>
            <dd>{payerName ?? 'No declarado'}</dd>
          </dl>

          {/*
            Sin el archivo delante, aprobar es firmar a ciegas. Cuando falta, se
            dice en vez de dejar el hueco: el revisor debe saber que está
            decidiendo sin evidencia y poder pedir corrección.
          */}
          {evidenceUrl === null ? (
            <p className="text-sm text-[var(--color-warning-ink,var(--color-ink))]">
              <strong>Sin archivo adjunto.</strong> No hay comprobante que revisar; pida corrección
              en lugar de aprobar.
            </p>
          ) : (
            <p className="text-sm">
              <a href={evidenceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                Abrir el comprobante adjunto
              </a>{' '}
              <span className="opacity-70">
                — el enlace caduca en cinco minutos; recargue para renovarlo.
              </span>
              {checksum !== null && (
                <>
                  <br />
                  <span className="font-mono text-xs opacity-60">
                    SHA-256 {checksum.slice(0, 16)}…
                  </span>
                </>
              )}
            </p>
          )}

          {charges.length === 0 ? (
            <p className="text-sm">
              Esta inscripción no tiene cargos pendientes. Aprobar dejará el importe completo como
              saldo a favor.
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
            <Button disabled={pending || issued !== null} onClick={approve}>
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
        </>
      )}
    </section>
  );
}
