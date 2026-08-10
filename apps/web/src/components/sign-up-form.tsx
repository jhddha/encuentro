'use client';

import { Button } from '@encuentro/ui';
import { useRouter } from 'next/navigation';
import { useState, type SyntheticEvent } from 'react';

import { authClient } from '@/lib/auth-client';

/**
 * Formulario público de alta — IAM-011.
 *
 * «El autoservicio exige una cuenta con correo único; no se generan correos
 * ficticios. El formulario público rechaza el alta sin correo y no crea
 * marcadores de posición.»
 *
 * **No distingue si la cuenta ya existe, y no hace falta que lo finja.** Con
 * `requireEmailVerification` activo, Better Auth responde a un alta duplicada
 * exactamente igual que a una nueva: mismo estado, misma forma, sin cookie y sin
 * correo al titular de la existente. Suprimirlo aquí no serviría de nada —la
 * respuesta viaja igual y se lee en cualquier inspector—, así que la propiedad
 * se fija donde importa, en `tests/integration/auth.test.ts`.
 *
 * Tampoco pide fecha de nacimiento. La edad se comprueba al inscribirse
 * (DEC-006), no al crear la cuenta: son dos cosas distintas y una cuenta no es
 * una inscripción.
 */
const GENERIC_ERROR =
  'No pudimos completar el registro. Revise los datos e inténtelo de nuevo en un momento.';

const inputClass =
  'min-h-[var(--size-touch-target)] rounded-md border border-[var(--color-ink)]/30 px-3 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]';

export function SignUpForm({
  firstFieldRef,
}: {
  readonly firstFieldRef?: React.Ref<HTMLInputElement>;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await authClient.signUp.email({ email, password, name });

    setPending(false);

    if (result.error) {
      setError(GENERIC_ERROR);
      return;
    }

    /*
     * DEC-013: el alta no inicia sesión. Better Auth no devuelve cookie cuando
     * la verificación es obligatoria, así que aquí no hay sesión que refrescar;
     * se lleva a la página que explica el siguiente paso.
     */
    router.push('/verificar-correo');
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
        <label htmlFor="signup-name" className="text-sm font-medium">
          Nombre
        </label>
        <input
          id="signup-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={120}
          ref={firstFieldRef}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="signup-email" className="text-sm font-medium">
          Correo
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-describedby="signup-email-ayuda"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          className={inputClass}
        />
        <p id="signup-email-ayuda" className="text-xs">
          Le enviaremos un enlace para verificarla. Sin verificar no podrá entrar.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="signup-password" className="text-sm font-medium">
          Contraseña
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          // `new-password` para que el gestor de contraseñas ofrezca generar una
          // y no rellene la del inicio de sesión.
          autoComplete="new-password"
          required
          minLength={12}
          aria-describedby="signup-password-ayuda"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          className={inputClass}
        />
        <p id="signup-password-ayuda" className="text-xs">
          Mínimo 12 caracteres.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Creando…' : 'Crear cuenta'}
      </Button>
    </form>
  );
}
