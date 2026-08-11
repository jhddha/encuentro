import { VisuallyHidden } from '@encuentro/ui';

import { SignOutButton } from '@/components/sign-out-button';
import { currentUser } from '@/lib/session';

/**
 * Identidad de la sesión y salida, en la cabecera.
 *
 * Vive en `Shell` y no en cada layout a propósito: la garantía que interesa es
 * «si hay sesión, siempre se puede cerrar», y una pantalla nueva no debería
 * poder olvidarla. `/configurar-mfa` demostró el coste de lo contrario — era un
 * callejón sin salida del que no se podía retroceder.
 *
 * Sin sesión no renderiza nada, así que las rutas públicas conservan su
 * cabecera tal cual.
 */
export async function AccountBar() {
  const user = await currentUser();

  if (user === null) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 md:gap-3">
      {/*
        El correo propio, para saber con qué cuenta se está operando. No es
        exposición de PII: es el dato de quien mira la pantalla, no de un
        tercero, y no viaja a registros, URL ni respuestas públicas.
      */}
      <span className="max-w-[16rem] truncate text-sm">
        <VisuallyHidden>Sesión iniciada como </VisuallyHidden>
        {user.email}
      </span>

      <SignOutButton />
    </div>
  );
}
