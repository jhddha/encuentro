import type { Metadata } from 'next';

import { PendingScreen, Shell } from '@/components/shell';

export const metadata: Metadata = { title: 'Comisión' };

/**
 * Espacio de una comisión.
 *
 * `commissionCode` es uno de los cuatro scopes de RBAC junto a global, gestión
 * y caja (requirements.md §10).
 */
export default async function CommissionPage({
  params,
}: {
  params: Promise<{ eventCode: string; commissionCode: string }>;
}) {
  const { eventCode, commissionCode } = await params;

  return (
    <Shell title={`Comisión ${commissionCode}`}>
      <PendingScreen
        title={`Comisión ${commissionCode} · gestión ${eventCode}`}
        phase="P03"
        scope="Vista acotada al scope de comisión, con permisos resueltos en servidor."
      />
    </Shell>
  );
}
