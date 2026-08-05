'use client';

import { Button } from '@encuentro/ui';
import { useRouter } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';

import { authClient } from '@/lib/auth-client';

/**
 * Formulario de inicio de sesión.
 *
 * El mensaje de error es **el mismo** para credenciales incorrectas, cuenta
 * inexistente y correo sin verificar. Distinguirlos convertiría el formulario
 * en un oráculo para averiguar qué direcciones están registradas.
 */
const GENERIC_ERROR = 'No pudimos iniciar sesión con esos datos. Revise el correo y la contraseña.';

const inputClass =
  'min-h-[var(--size-touch-target)] rounded-md border border-[var(--color-ink)]/30 px-3 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]';

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await authClient.signIn.email({ email, password });

    setPending(false);

    if (result.error) {
      setError(GENERIC_ERROR);
      return;
    }

    router.push('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      {error !== null && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          <span aria-hidden="true">✕ </span>
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={12}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          className={inputClass}
        />
        <p className="text-xs">Mínimo 12 caracteres.</p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Verificando…' : 'Ingresar'}
      </Button>
    </form>
  );
}
