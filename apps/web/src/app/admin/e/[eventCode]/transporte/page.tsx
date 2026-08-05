import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Transporte' };

export default function Page() {
  return <PendingScreen title="Transporte" phase="P10" scope="Vehículos, horarios y traslados." />;
}
