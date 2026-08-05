import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Contabilidad' };

export default function Page() {
  return (
    <PendingScreen title="Contabilidad" phase="P12" scope="Asientos, tesorería y rendiciones." />
  );
}
