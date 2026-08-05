import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Pagos' };

export default function Page() {
  return (
    <PendingScreen
      title="Pagos"
      phase="P07"
      scope="Bandeja de evidencias y revisión humana (PAY-005, PAY-006)."
    />
  );
}
