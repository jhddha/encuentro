import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Auditoría' };

export default function Page() {
  return (
    <PendingScreen
      title="Auditoría"
      phase="P03"
      scope="Registro append-only; no se reescribe (GOV-005, GOV-009)."
    />
  );
}
