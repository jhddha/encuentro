import type { Metadata } from 'next';

import { PendingScreen, Shell } from '@/components/shell';
import { requireActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Cambiar la contraseña' };

export const dynamic = 'force-dynamic';

/**
 * Primer acceso de encargados y coordinadores — SRV-010.
 *
 * A quien recibe una credencial temporal se le exige cambiarla antes de operar,
 * igual que a quien necesita segundo factor se le exige registrarlo. Cuando el
 * flujo exista, `requireActor` traerá aquí a quien tenga la marca puesta, del
 * mismo modo que hoy lleva a `/configurar-mfa`.
 *
 * Better Auth 1.6.26 **no trae** ni la marca ni la caducidad: `POST
 * /change-password` cambia la contraseña pidiendo la actual, y nada más. Las
 * dos columnas son nuestras. Ver DEC-020.
 */
export default async function ChangePasswordPage() {
  await requireActor();
  return (
    <Shell title="Cambiar la contraseña">
      <PendingScreen
        title="Cambiar la contraseña"
        phase="P11"
        scope="Primer acceso de encargados y coordinadores con credencial temporal."
      />
    </Shell>
  );
}
