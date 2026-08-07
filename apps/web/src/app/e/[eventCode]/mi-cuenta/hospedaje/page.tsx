import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Mi hospedaje' };

export default function Page() {
  return (
    <PendingScreen
      title="Mi hospedaje"
      phase="P06"
      scope="Elección de hotel; la habitación la asigna Hospedaje (HOS-001)."
    />
  );
}
