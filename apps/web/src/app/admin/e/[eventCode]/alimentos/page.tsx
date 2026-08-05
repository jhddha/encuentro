import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Alimentos' };

export default function Page() {
  return (
    <PendingScreen
      title="Alimentos"
      phase="P11"
      scope="Servicios por fecha, horario y cantidad (FOOD-001..004)."
    />
  );
}
