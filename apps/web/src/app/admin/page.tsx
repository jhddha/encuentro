import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Administración' };

export default function Page() {
  return (
    <PendingScreen title="Administración" phase="P03" scope="Punto de entrada tras autenticar." />
  );
}
