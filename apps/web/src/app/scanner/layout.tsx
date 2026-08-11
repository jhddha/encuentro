import type { ReactNode } from 'react';

import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Guardián de las pantallas de escáner.
 *
 * Mismo motivo y mismo alcance que el de `/caja`: la ruta no tenía layout y por
 * tanto no tenía guardián. Solo autenticación; el scope `stationCode` acota el
 * permiso del servidor de estación (SRV-003) cuando la pantalla exista.
 */
export default async function ScannerLayout({ children }: { children: ReactNode }) {
  await requireActor();

  return <>{children}</>;
}
