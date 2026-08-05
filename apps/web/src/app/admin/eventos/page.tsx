import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Gestiones' };

export default function Page() {
  return (
    <PendingScreen
      title="Gestiones"
      phase="P03"
      scope="Alta, transiciones manuales y cierres auditados (EVT-001, EVT-003)."
    />
  );
}
