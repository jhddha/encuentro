import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Dashboard' };

export default function Page() {
  return <PendingScreen title="Dashboard" phase="P03" scope="Indicadores de la gestión." />;
}
