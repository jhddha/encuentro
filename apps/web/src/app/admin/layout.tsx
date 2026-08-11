import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Shell, ShellNav } from '@/components/shell';
import { pilgrimHome, requireActor } from '@/lib/session';

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
 *
 * Lo único que sí se decide aquí es la puerta: sin ninguna asignación de rol no
 * hay permiso que conceder en ninguna pantalla de administración (IAM-003), así
 * que quien llega sin asignaciones se va a su cuenta. Se resuelve en la
 * frontera y no en cada botón que navega, porque también entran por aquí el
 * marcador guardado y la URL escrita a mano.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();

  if (actor.assignments.length === 0) {
    redirect(await pilgrimHome());
  }

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
