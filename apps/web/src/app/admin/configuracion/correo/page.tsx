import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Configuración de correo' };

export default function Page() {
  return (
    <PendingScreen
      title="Configuración de correo"
      phase="P13"
      scope="SMTP global y sin event_id (GOV-007)."
    />
  );
}
