import type { Metadata } from 'next';

import { PendingScreen, Shell } from '@/components/shell';

export const metadata: Metadata = { title: 'Mi servicio' };

export const dynamic = 'force-dynamic';

/**
 * Panel del servidor — SRV-012, SRV-014.
 *
 * Estado de su solicitud y, cuando la gestión cobre, su pago. El esquema ya
 * existe —`server_registrations` con sus siete estados— pero todavía no hay
 * caso de uso que cree ninguna, así que esta pantalla no tiene nada que leer.
 *
 * **Nace con guardián**, y no como las pendientes de la fase 2: lo pone
 * `layout.tsx`, que cubre el árbol entero. La lección la dio
 * `mi-cuenta/credencial`, una `PendingScreen` sin puerta que responde 200 a
 * cualquiera; el día que se le pone contenido nadie se acuerda de cerrarla, y
 * aquí va a haber datos personales y el estado de un pago.
 */
export default function ServerPanelPage() {
  return (
    <Shell title="Mi servicio">
      <PendingScreen
        title="Mi servicio"
        phase="P11"
        scope="Estado de la solicitud del servidor y, si la gestión cobra inscripción, su pago."
      />
    </Shell>
  );
}
