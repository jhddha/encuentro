import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Catálogo' };

export default function Page() {
  return (
    <PendingScreen
      title="Catálogo"
      phase="P05"
      scope="Paquetes PUBLIC/PRIVATE y versiones de precio (PKG-001..005)."
    />
  );
}
