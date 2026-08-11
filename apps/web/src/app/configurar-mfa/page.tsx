import { Card, PageHeader, StatusBadge } from '@encuentro/ui';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { MfaEnrollment } from '@/components/mfa-enrollment';
import { Shell } from '@/components/shell';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

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
 *
 * La página no puede usar `requireActor`: ese es justamente quien manda aquí, y
 * llamarlo desde el destino sería un bucle. Repite las dos primeras
 * comprobaciones en el mismo orden y añade la suya.
 */
export default async function ConfigureMfaPage() {
  const user = await currentUser();

  if (user === null) {
    redirect('/ingresar');
  }

  if (!user.emailVerified) {
    redirect('/verificar-correo');
  }

  /*
   * Con el segundo factor ya activo, esta pantalla es peligrosa y no útil:
   * `enable` **sustituye** el secreto y los códigos de recuperación, así que
   * volver aquí con el botón Atrás y confirmar la contraseña dejaba inservible
   * la aplicación autenticadora ya configurada.
   *
   * Se va a /admin y no a una pantalla propia porque la puerta de /admin ya
   * sabe repartir: al personal lo deja pasar y al peregrino lo manda a su
   * cuenta.
   *
   * Queda un hueco declarado: cambiar de dispositivo exige rehacer el registro,
   * y para eso hace falta un desactivado deliberado que hoy no existe en
   * ninguna pantalla. DEC-014 lo trata como restablecimiento presencial.
   */
  if (user.twoFactorEnabled) {
    redirect('/admin');
  }

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
