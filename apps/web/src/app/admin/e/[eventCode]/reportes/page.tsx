import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Reportes' };

export default function Page() {
  return (
    <PendingScreen title="Reportes" phase="P13" scope="Reportes y exportaciones por gestión." />
  );
}
