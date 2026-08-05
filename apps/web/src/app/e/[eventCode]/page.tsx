import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Gestión' };

export default function Page() {
  return (
    <PendingScreen
      title="Gestión"
      phase="P03"
      scope="Resuelve la gestión pública única (EVT-004, EVT-006)."
    />
  );
}
