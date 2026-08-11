'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authClient } from '@/lib/auth-client';

/**
 * Cierre de sesión.
 *
 * No existía ninguno: se podía entrar al sistema y no salir. Con el segundo
 * factor obligatorio (DEC-014) eso además impedía comprobar una segunda cuenta,
 * porque la única forma de soltar la sesión era borrar la cookie a mano.
 *
 * Tras `signOut` se navega y se refresca: `push` cambia de ruta y `refresh`
 * invalida la caché de router del cliente, que de otro modo podría servir el
 * árbol ya renderizado de la cuenta anterior.
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function salir(): Promise<void> {
    setPending(true);
    setFailed(false);

    const result = await authClient.signOut();

    if (result.error) {
      setPending(false);
      setFailed(true);
      return;
    }

    // No se restablece `pending`: la navegación ya está en marcha y volver a
    // habilitar el botón solo invita a un segundo cierre sin sesión que cerrar.
    router.push('/ingresar');
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {failed && (
        <span role="alert" className="text-xs text-[var(--color-danger)]">
          No pudimos cerrar la sesión. Inténtelo de nuevo.
        </span>
      )}

      <button
        type="button"
        onClick={() => void salir()}
        disabled={pending}
        className="inline-flex min-h-[var(--size-touch-target)] items-center rounded-md border border-[var(--color-ink)]/30 px-3 text-sm hover:bg-[var(--color-ink)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Cerrando…' : 'Cerrar sesión'}
      </button>
    </div>
  );
}
