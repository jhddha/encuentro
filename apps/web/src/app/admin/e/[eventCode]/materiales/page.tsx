import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Materiales' };

export default function Page() {
  return (
    <PendingScreen
      title="Materiales"
      phase="P11"
      scope="Inventario, kits y entregas (MAT-001..003)."
    />
  );
}
