import type { Metadata } from 'next';

import { AuthPanel } from '@/components/auth-panel';
import { Shell } from '@/components/shell';

export const metadata: Metadata = {
  title: 'Ingresar',
  robots: { index: false, follow: false },
};

/**
 * Acceso y alta pública — IAM-011, DEC-013.
 *
 * Las dos cosas en la misma ruta: `contracts/routes.json` declara treinta y una
 * rutas exactas y `/registro` no es una de ellas. Ver `AuthPanel`.
 */
export default function SignInPage() {
  return (
    <Shell title="Encuentro">
      <AuthPanel />
    </Shell>
  );
}
