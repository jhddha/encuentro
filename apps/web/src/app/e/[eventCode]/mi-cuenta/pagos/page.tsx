import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Mis pagos' };

export default function Page() {
  return (
    <PendingScreen
      title="Mis pagos"
      phase="P07"
      scope="Carga de comprobante bancario y estado de cuenta."
    />
  );
}
