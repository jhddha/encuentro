import type { Metadata } from 'next';

import { PendingScreen, Shell } from '@/components/shell';

export const metadata: Metadata = { title: 'Caja' };

/**
 * Punto de cobro presencial.
 *
 * PAY-011: todo cobro ocurre dentro de una sesión de caja abierta. El scope
 * `cashCode` acota el permiso del cajero (regla 03-security-rbac).
 */
export default async function CashPage({
  params,
}: {
  params: Promise<{ eventCode: string; cashCode: string }>;
}) {
  const { eventCode, cashCode } = await params;

  return (
    <Shell title={`Caja ${cashCode}`}>
      <PendingScreen
        title={`Caja ${cashCode} · gestión ${eventCode}`}
        phase="P07"
        scope="Sesión de caja, cobro en efectivo o QR y arqueo de cierre (PAY-011, PAY-012)."
      />
    </Shell>
  );
}
