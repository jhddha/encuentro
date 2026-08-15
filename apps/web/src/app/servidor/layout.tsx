import type { ReactNode } from 'react';

import { requireActor } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Guardián del panel del servidor.
 *
 * En App Router el layout es lo único que cubre un árbol entero, y bajo
 * `/servidor` van a colgar el estado de la solicitud, los datos personales del
 * formulario y el pago. Se pone la puerta ahora, cuando las pantallas todavía
 * están vacías, porque el día que tengan contenido nadie se acuerda.
 *
 * Solo *autenticación*: `requireActor` exige sesión y correo verificado
 * (DEC-013). El servidor no tiene asignaciones de rol, así que no necesita
 * segundo factor (DEC-019). La *autorización* —que la solicitud sea suya— la
 * exigirá cada operación, porque depende del recurso y no de estar aquí debajo.
 *
 * No renderiza `Shell`: cada página trae la suya con su propio título.
 */
export default async function ServerLayout({ children }: { children: ReactNode }) {
  await requireActor();

  return <>{children}</>;
}
