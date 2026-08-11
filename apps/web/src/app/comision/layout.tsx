import type { ReactNode } from 'react';

import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Guardián de las pantallas de comisión.
 *
 * Mismo motivo y mismo alcance que el de `/caja`: la ruta no tenía layout y por
 * tanto no tenía guardián. Solo autenticación; el scope `commissionCode` acota
 * el permiso cuando la pantalla exista.
 */
export default async function CommissionLayout({ children }: { children: ReactNode }) {
  await requireActor();

  return <>{children}</>;
}
