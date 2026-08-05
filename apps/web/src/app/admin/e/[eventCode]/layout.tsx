import type { ReactNode } from 'react';

import { ShellNav } from '@/components/shell';

/**
 * Sub-shell de una gestión concreta.
 *
 * Se anida dentro del shell de administración y añade la navegación por
 * módulos. El selector de gestión propiamente dicho depende de Events (P03).
 */
export default async function AdminEventLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ eventCode: string }>;
}) {
  const { eventCode } = await params;
  const base = `/admin/e/${eventCode}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-[var(--color-ink)]/15 p-3">
        <p className="mb-2 text-xs uppercase tracking-wide">
          Gestión <span className="font-mono">{eventCode}</span>
        </p>
        <ShellNav
          label="Módulos de la gestión"
          items={[
            { href: `${base}/dashboard`, label: 'Dashboard' },
            { href: `${base}/configuracion`, label: 'Configuración' },
            { href: `${base}/catalogo`, label: 'Catálogo' },
            { href: `${base}/inscripciones`, label: 'Inscripciones' },
            { href: `${base}/pagos`, label: 'Pagos' },
            { href: `${base}/comprobantes`, label: 'Comprobantes' },
            { href: `${base}/hospedaje`, label: 'Hospedaje' },
            { href: `${base}/alimentos`, label: 'Alimentos' },
            { href: `${base}/materiales`, label: 'Materiales' },
            { href: `${base}/transporte`, label: 'Transporte' },
            { href: `${base}/contabilidad`, label: 'Contabilidad' },
            { href: `${base}/reportes`, label: 'Reportes' },
            { href: `${base}/auditoria`, label: 'Auditoría' },
          ]}
        />
      </div>
      {children}
    </div>
  );
}
