import { Card, PageHeader, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';

import { MfaEnrollment } from '@/components/mfa-enrollment';
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
            Usa cualquier aplicación autenticadora estándar.{' '}
            <strong>No se envía ningún correo:</strong> el segundo factor es un código que genera tu
            aplicación.
          </p>
          <p className="text-sm">
            Si pierdes el dispositivo sin tus códigos de recuperación, el restablecimiento es
            presencial y lo autoriza un administrador; no existe recuperación automática por correo.
          </p>
        </Card>

        {/*
          Hasta el 8-ago-2026 esta página terminaba aquí: explicaba el trámite y
          no ofrecía forma de hacerlo. Como `requireActor` redirige aquí a toda
          cuenta con algún rol, era un callejón sin salida.
        */}
        <Card>
          <MfaEnrollment />
        </Card>
      </div>
    </Shell>
  );
}
