import type { ReactNode } from 'react';

import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Guardián de las pantallas de caja.
 *
 * `/caja`, `/comision` y `/scanner` eran las tres rutas del contrato **sin
 * ningún guardián**: respondían 200 a un anónimo porque no tenían layout, y en
 * App Router el layout es lo único que cubre un árbol entero. Hoy no filtran
 * nada porque son marcadores de fase, y ese es justamente el momento de poner
 * la puerta: el día que la pantalla tenga datos, la puerta ya estará.
 *
 * Solo *autenticación*, igual que en `/admin`: `requireActor` exige sesión,
 * correo verificado (DEC-013) y segundo factor si hay asignaciones (DEC-014).
 * La *autorización* por permiso y scope —el `cashCode` acota al cajero, PAY-011,
 * regla 03-security-rbac— la exigirá cada operación cuando exista, porque
 * depende del recurso concreto y no del hecho de estar bajo /caja.
 *
 * No renderiza `Shell`: cada página trae la suya con su propio título.
 */
export default async function CashLayout({ children }: { children: ReactNode }) {
  await requireActor();

  return <>{children}</>;
}
