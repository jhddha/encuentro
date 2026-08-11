'use client';

import { Button } from '@encuentro/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

import { authClient } from '@/lib/auth-client';

/**
 * Segundo paso del acceso — DEC-014.
 *
 * `signIn.email` **no abre sesión** cuando la cuenta tiene segundo factor:
 * responde sin error y con `twoFactorRedirect`, dejando una cookie temporal a la
 * espera del código. Sin esta pantalla, el formulario daba el acceso por bueno,
 * navegaba a `/admin`, el guardián no encontraba sesión y devolvía a `/ingresar`
 * con los campos vacíos. Parecía que el formulario se recargaba solo.
 *
 * Vive dentro de `/ingresar` y no en una ruta propia porque
 * `contracts/routes.json` declara treinta y una rutas exactas, igual que el alta
 * pública en `AuthPanel`.
 *
 * Admite también un código de recuperación: DEC-014 los presenta como la única
 * vía si se pierde el dispositivo, y no aceptarlos aquí los dejaría sin uso.
 */

const inputClass =
  'min-h-[var(--size-touch-target)] rounded-md border border-[var(--color-ink)]/30 px-3 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]';

export function TwoFactorChallenge({ onCancel }: { readonly onCancel: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [usandoRespaldo, setUsandoRespaldo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  /*
   * El foco pasa al campo nuevo. Sin esto se queda en el botón «Ingresar», que
   * acaba de desaparecer, y con teclado o lector de pantalla el cambio de paso
   * pasa inadvertido (WCAG 2.4.3). Mismo motivo que en `AuthPanel`.
   */
  useEffect(() => {
    campo.current?.focus();
  }, [usandoRespaldo]);

  async function verificar(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = usandoRespaldo
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code });

    if (result.error) {
      setPending(false);
      setCode('');
      setError(
        usandoRespaldo
          ? 'Ese código de recuperación no es válido o ya se usó.'
          : 'Ese código no es válido. Compruebe la hora de su dispositivo e inténtelo de nuevo.',
      );
      return;
    }

    // `pending` no se restablece: la navegación ya está en marcha.
    router.push('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void verificar(event)} className="flex flex-col gap-4">
      <p className="text-sm">
        {usandoRespaldo
          ? 'Escriba uno de los códigos de recuperación que guardó al activar el segundo factor. Cada uno sirve una sola vez.'
          : 'Abra su aplicación autenticadora y escriba el código que muestra para esta cuenta.'}
      </p>

      {error !== null && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          <span aria-hidden="true">✕ </span>
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="two-factor-code" className="text-sm font-medium">
          {usandoRespaldo ? 'Código de recuperación' : 'Código de seis dígitos'}
        </label>
        <input
          id="two-factor-code"
          name="code"
          type="text"
          /*
           * El teclado numérico y el patrón solo valen para el TOTP: los códigos
           * de recuperación llevan letras, y forzarlos aquí impediría escribirlos
           * justo cuando son la única vía que le queda a la persona.
           */
          inputMode={usandoRespaldo ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          required
          {...(usandoRespaldo ? {} : { pattern: '[0-9]{6}', maxLength: 6 })}
          ref={campo}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
          }}
          className={`${inputClass} font-mono tracking-widest`}
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Comprobando…' : 'Entrar'}
      </Button>

      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            setUsandoRespaldo(!usandoRespaldo);
            setCode('');
            setError(null);
          }}
          className="min-h-[var(--size-touch-target)] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
        >
          {usandoRespaldo ? 'Usar la aplicación autenticadora' : 'No tengo el dispositivo'}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="min-h-[var(--size-touch-target)] underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]"
        >
          Entrar con otra cuenta
        </button>
      </div>
    </form>
  );
}
