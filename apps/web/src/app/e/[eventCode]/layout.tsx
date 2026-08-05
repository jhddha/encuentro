import type { ReactNode } from 'react';

import { Shell, ShellNav } from '@/components/shell';

/**
 * Shell del peregrino.
 *
 * `eventCode` viaja en la URL porque toda operación pertenece a una gestión
 * (GOV-001). La resolución real de la gestión llega con el módulo Events (P03);
 * aquí solo se propaga el segmento.
 */
export default async function PilgrimLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ eventCode: string }>;
}) {
  const { eventCode } = await params;
  const base = `/e/${eventCode}`;

  return (
    <Shell
      title="Encuentro"
      nav={
        <ShellNav
          label="Navegación del peregrino"
          items={[
            { href: base, label: 'Gestión' },
            { href: `${base}/inscripcion`, label: 'Inscripción' },
            { href: `${base}/mi-cuenta`, label: 'Mi cuenta' },
            { href: `${base}/mi-cuenta/pagos`, label: 'Pagos' },
            { href: `${base}/mi-cuenta/hospedaje`, label: 'Hospedaje' },
            { href: `${base}/mi-cuenta/credencial`, label: 'Credencial' },
            { href: `${base}/mi-cuenta/notificaciones`, label: 'Notificaciones' },
          ]}
        />
      }
    >
      {children}
    </Shell>
  );
}
