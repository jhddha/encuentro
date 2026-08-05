import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Mis notificaciones' };

export default function Page() {
  return (
    <PendingScreen title="Mis notificaciones" phase="P13" scope="Historial de correos enviados." />
  );
}
