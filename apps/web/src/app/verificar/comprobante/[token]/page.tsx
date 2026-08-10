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
  const result = await verifyReceiptToken(token);

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

        {/*
          Solo ocurre si falta `RECEIPT_VERIFICATION_SECRET`. No se le dice al
          visitante que el comprobante no existe, porque no es verdad: lo que
          falla es este servidor.
        */}
        {result.kind === 'unavailable' && (
          <ErrorState
            title="Verificación no disponible"
            description="No podemos comprobar el comprobante en este momento. Vuelva a intentarlo más tarde o consulte con la organización."
          />
        )}
      </div>
    </Shell>
  );
}
