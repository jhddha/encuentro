import { Card, PageHeader, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';

import { Shell } from '@/components/shell';

export const metadata: Metadata = {
  title: 'Configurar segundo factor',
  robots: { index: false, follow: false },
};

/**
 * Registro del segundo factor — DEC-014.
 *
 * Obligatorio para toda cuenta con al menos una asignación de rol. Quien llega
 * aquí tiene sesión iniciada y correo verificado, pero no puede operar hasta
 * completar el registro.
 */
export default function ConfigureMfaPage() {
  return (
    <Shell title="Encuentro">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <PageHeader
          title="Configura tu segundo factor"
          actions={<StatusBadge tone="warning">Obligatorio</StatusBadge>}
        />

        <Card className="flex flex-col gap-3">
          <p>
            Tu cuenta tiene permisos asignados, así que necesita un segundo factor antes de poder
            operar.
          </p>
          <p className="text-sm">
            Usa cualquier aplicación autenticadora estándar. Al activarlo recibirás códigos de
            recuperación de un solo uso: guárdalos en un lugar seguro, porque son la única vía si
            pierdes el dispositivo.
          </p>
          <p className="text-sm">
            Si lo pierdes sin códigos, el restablecimiento es presencial y lo autoriza un
            administrador; no existe recuperación automática por correo.
          </p>
        </Card>
      </div>
    </Shell>
  );
}
