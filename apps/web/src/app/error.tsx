'use client';

import { Button, ErrorState, PageHeader } from '@encuentro/ui';
import Link from 'next/link';

/**
 * Frontera de error de la aplicación.
 *
 * **No había ninguna en todo el repositorio.** Cualquier excepción que
 * escapara del render de una página —incluida la que lanza `authorize` cuando
 * falta un permiso, que es la vía normal de negar acceso (ADR-010)— terminaba
 * en un 500 crudo. La autorización funcionaba y su resultado parecía una
 * avería.
 *
 * Un mensaje único y genérico a propósito: distinguir «no tiene permiso» de
 * «algo se rompió» convertiría esta pantalla en un oráculo sobre qué recursos
 * existen y sobre qué puede hacer cada cual. Next además reemplaza el mensaje
 * real en producción, así que fingir precisión aquí sería fingirla dos veces.
 *
 * No cubre los errores del layout raíz: eso exige `global-error.tsx`, y ese
 * layout no hace nada que pueda fallar.
 */
export default function AppError({ reset }: { readonly reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-6 p-6">
      <PageHeader title="No pudimos mostrar esta pantalla" />

      <ErrorState
        title="La operación no se completó"
        description="Puede que no tenga permiso sobre este recurso o que algo haya fallado de nuestro lado. No se ha guardado ningún cambio."
        action={
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                reset();
              }}
            >
              Reintentar
            </Button>

            <Link
              href="/"
              className="inline-flex min-h-[var(--size-touch-target)] items-center rounded-md border border-[var(--color-ink)] px-5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
            >
              Volver al inicio
            </Link>
          </div>
        }
      />
    </div>
  );
}
