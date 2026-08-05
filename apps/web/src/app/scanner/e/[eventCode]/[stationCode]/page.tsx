import type { Metadata } from 'next';

import { PendingScreen, Shell } from '@/components/shell';

export const metadata: Metadata = { title: 'Estación de escaneo' };

/**
 * Estación de escaneo QR.
 *
 * Funciona offline con cola local y sincronización idempotente por estación y
 * `operation_uuid` (system-architecture.md §7). Llega en P09.
 */
export default async function ScannerPage({
  params,
}: {
  params: Promise<{ eventCode: string; stationCode: string }>;
}) {
  const { eventCode, stationCode } = await params;

  return (
    <Shell title={`Estación ${stationCode}`}>
      <PendingScreen
        title={`Estación ${stationCode} · gestión ${eventCode}`}
        phase="P09"
        scope="Escaneo, cola offline y entrega idempotente multiestación."
      />
    </Shell>
  );
}
