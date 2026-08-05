import type { ReactNode } from 'react';

import { Shell, ShellNav } from '@/components/shell';

/**
 * Shell de administración.
 *
 * Sin autenticación todavía: DEC-016 sigue BLOCKING y P01 prohibió implementar
 * auth productiva. Cuando exista, este layout es el punto donde se exige sesión
 * y se resuelven permisos y scope en servidor (regla 03-security-rbac).
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
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
