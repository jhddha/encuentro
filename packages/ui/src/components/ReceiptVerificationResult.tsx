import type { PublicReceiptVerification } from '@encuentro/domain';

import { Card } from './layout.js';
import { StatusBadge } from './StatusBadge.js';

/**
 * Resultado de la verificación pública de un Comprobante de pago.
 *
 * Recibe únicamente la proyección pública (`PublicReceiptVerification`), que el
 * dominio construye campo por campo. Este componente no puede filtrar PII
 * porque nunca la recibe: el tipo no la contiene.
 *
 * PAY-011 exige el pie «Documento de control interno».
 */
export function ReceiptVerificationResult({
  receipt,
}: {
  readonly receipt: PublicReceiptVerification;
}) {
  const isVoid = receipt.status === 'VOID';

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* h2: el h1 de la página lo pone la propia ruta de verificación. */}
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Comprobante de pago</h2>
        <StatusBadge tone={isVoid ? 'danger' : 'success'}>
          {isVoid ? 'Anulado' : 'Válido'}
        </StatusBadge>
      </div>

      {isVoid && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          Este comprobante fue anulado y no acredita un pago vigente.
        </p>
      )}

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide">Número</dt>
          <dd className="font-mono text-base">{receipt.number}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide">Gestión</dt>
          <dd className="font-mono text-base">{receipt.eventCode}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide">Fecha de emisión</dt>
          <dd className="text-base">
            <time dateTime={receipt.issuedAt}>{receipt.issuedAt}</time>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide">Monto</dt>
          <dd className="font-mono text-base">
            {receipt.amount} {receipt.currency}
          </dd>
        </div>
      </dl>

      <p className="border-t border-[var(--color-ink)]/15 pt-4 text-xs">
        Documento de control interno. Esta vista pública no muestra datos personales; el detalle
        completo requiere sesión autorizada.
      </p>
    </Card>
  );
}
