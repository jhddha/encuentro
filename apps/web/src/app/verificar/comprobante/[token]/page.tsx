import { ErrorState, PageHeader, ReceiptVerificationResult } from '@encuentro/ui';
import type { Metadata } from 'next';

import { Shell } from '@/components/shell';
import { verifyReceiptToken } from '@/lib/receipt-verification';

export const metadata: Metadata = {
  title: 'Verificación de comprobante',
  // El QR es público, pero la página no debe acabar indexada por buscadores.
  robots: { index: false, follow: false },
};

/**
 * Verificación pública de Comprobante de pago.
 *
 * Única ruta del sistema accesible sin sesión con datos de una transacción.
 * DEC-003 y PAY-031 la limitan a validez, número, evento, fecha, monto, moneda
 * y estado. El token nunca se muestra en pantalla: identifica el comprobante y
 * repetirlo en el cuerpo solo amplía su superficie de exposición.
 */
export default async function ReceiptVerificationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = verifyReceiptToken(token);

  return (
    <Shell title="Verificación de comprobante">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Verificación de comprobante"
          description="Consulta pública. No muestra datos personales."
        />

        {result.kind === 'found' && <ReceiptVerificationResult receipt={result.receipt} />}

        {result.kind === 'not-found' && (
          <ErrorState
            title="Comprobante no encontrado"
            description="El código escaneado no corresponde a ningún comprobante emitido. Verifique que el QR esté completo y sin daños."
          />
        )}

        {result.kind === 'unavailable' && (
          <ErrorState
            title="Verificación no disponible todavía"
            description="La emisión de comprobantes se habilita en la fase de pagos. Aún no existe ningún comprobante que verificar."
          />
        )}
      </div>
    </Shell>
  );
}
