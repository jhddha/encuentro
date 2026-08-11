import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Hospedaje' };

export default function Page() {
  return (
    <PendingScreen
      title="Hospedaje"
      phase="P06"
      scope="Hoteles, inventario y asignación de habitación (HOS-011, HOS-013, HOS-012, HOS-003, HOS-016, HOS-017, HOS-001, HOS-002)."
    />
  );
}
