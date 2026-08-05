import type { ReactNode } from 'react';

import { Shell, ShellNav } from '@/components/shell';
import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Shell de administración.
 *
 * `requireActor` exige sesión, correo verificado (DEC-013) y segundo factor
 * para toda cuenta con asignaciones de rol (DEC-014). La comprobación ocurre en
 * servidor, en el layout, así que cubre todas las rutas anidadas sin que cada
 * página tenga que acordarse (GOV-006, regla 03-security-rbac).
 *
 * Ojo: esto garantiza *autenticación*. La *autorización* por permiso y scope la
 * exige cada acción con `requirePermission`, porque el permiso depende del
 * recurso concreto, no del hecho de estar dentro de /admin.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireActor();

  return (
    <Shell
      title="Encuentro · Administración"
      nav={
        <ShellNav
          label="Navegación de administración"
          items={[
            { href: '/admin', label: 'Inicio' },
            { href: '/admin/eventos', label: 'Gestiones' },
            { href: '/admin/configuracion/correo', label: 'Correo' },
          ]}
        />
      }
    >
      {children}
    </Shell>
  );
}
