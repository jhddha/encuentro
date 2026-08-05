import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Mi credencial' };

export default function Page() {
  return (
    <PendingScreen
      title="Mi credencial"
      phase="P08"
      scope="Credencial con QR, sin PII en el token (requirements.md §10)."
    />
  );
}
