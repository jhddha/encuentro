import { Card, PageHeader } from '@encuentro/ui';
import type { Metadata } from 'next';

import { Shell } from '@/components/shell';

export const metadata: Metadata = {
  title: 'Verificar correo',
  robots: { index: false, follow: false },
};

/**
 * Aviso de verificación pendiente — DEC-013.
 *
 * No muestra la dirección de destino ni confirma si existe: es una página
 * accesible sin sesión completa y no debe servir para comprobar direcciones.
 */
export default function VerifyEmailPage() {
  return (
    <Shell title="Encuentro">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <PageHeader title="Verifica tu correo" />
        <Card className="flex flex-col gap-3">
          <p>
            Enviamos un enlace de verificación a la dirección con la que te registraste. Ábrelo para
            activar tu cuenta.
          </p>
          <p className="text-sm">
            El enlace caduca y solo puede usarse una vez. Si no llegó, revisa la carpeta de correo
            no deseado antes de solicitar otro.
          </p>
        </Card>
      </div>
    </Shell>
  );
}
