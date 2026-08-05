import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Inscripciones' };

export default function Page() {
  return (
    <PendingScreen
      title="Inscripciones"
      phase="P05"
      scope="Inscripción presencial y asignación de paquete privado (PKG-003)."
    />
  );
}
