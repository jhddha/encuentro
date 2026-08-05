import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Hospedaje' };

export default function Page() {
  return (
    <PendingScreen
      title="Hospedaje"
      phase="P06"
      scope="Hoteles, inventario y asignación de habitación (HOS-001..008)."
    />
  );
}
