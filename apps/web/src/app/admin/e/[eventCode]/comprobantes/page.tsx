import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Comprobantes' };

export default function Page() {
  return (
    <PendingScreen
      title="Comprobantes"
      phase="P07"
      scope="Emisión, secuencia por gestión y anulación (PAY-028..015)."
    />
  );
}
