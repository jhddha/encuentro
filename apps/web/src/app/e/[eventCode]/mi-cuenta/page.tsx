import type { Metadata } from 'next';

import { PendingScreen } from '@/components/shell';

export const metadata: Metadata = { title: 'Mi cuenta' };

export default function Page() {
  return (
    <PendingScreen title="Mi cuenta" phase="P05" scope="Resumen de inscripción, cargos y saldo." />
  );
}
