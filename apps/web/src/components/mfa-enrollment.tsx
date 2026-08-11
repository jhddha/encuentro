'use client';

import { Button } from '@encuentro/ui';
import { useRouter } from 'next/navigation';
import { toDataURL } from 'qrcode';
import { useEffect, useState, type SyntheticEvent } from 'react';

import { authClient } from '@/lib/auth-client';

/**
 * Registro del segundo factor — DEC-014.
 *
 * **Esta pantalla era solo texto.** Explicaba que hacía falta un segundo factor
 * y no ofrecía ninguna forma de registrarlo: ni secreto, ni código, ni botón. Y
 * `requireActor` redirige aquí a **toda cuenta con algún rol**, así que era un
 * callejón sin salida: nadie con permisos podía usar el sistema. Lo encontró el
 * primer recorrido a mano, no las pruebas — todas miran por debajo de la
 * interfaz.
 *
 * Son dos pasos y no uno porque Better Auth los separa a propósito: `enable`
 * entrega el secreto pero **no activa nada**, y `verifyTotp` solo lo activa
 * cuando la persona demuestra que su aplicación genera el código correcto.
 * Activarlo antes dejaría cuentas bloqueadas fuera del sistema si el secreto no
 * llegó a guardarse bien.
 *
 * El código QR es el camino principal y la clave a mano el respaldo, no al
 * revés: teclear treinta y dos caracteres en base32 desde un móvil es lento y
 * los errores no se ven hasta que el código falla. La clave se queda visible
 * porque hay aplicaciones sin cámara y personas que no pueden usarla.
 *
 * Se genera **en el navegador**, a partir de la URI que ya está en memoria. El
 * secreto no hace ningún viaje que no hiciera antes.
 */

const inputClass =
  'min-h-[var(--size-touch-target)] rounded-md border border-[var(--color-ink)]/30 px-3 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ink)]';

interface Secreto {
  readonly totpURI: string;
  readonly backupCodes: readonly string[];
}

/** El secreto viaja dentro de la URI `otpauth://`; se extrae para poder teclearlo. */
function secretoDe(totpURI: string): string {
  try {
    return new URL(totpURI).searchParams.get('secret') ?? totpURI;
  } catch {
    return totpURI;
  }
}

export function MfaEnrollment() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secreto, setSecreto] = useState<Secreto | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /*
   * El QR se dibuja aparte del render porque generarlo es asíncrono. Si falla
   * —y puede, es una librería más— no se rompe la pantalla: queda la clave
   * escrita, que sigue sirviendo para terminar el registro.
   */
  useEffect(() => {
    if (secreto === null) return;

    let vigente = true;

    toDataURL(secreto.totpURI, { errorCorrectionLevel: 'M', margin: 1, width: 220 }).then(
      (imagen) => {
        if (vigente) setQr(imagen);
      },
      () => {
        if (vigente) setQr(null);
      },
    );

    return () => {
      vigente = false;
    };
  }, [secreto]);

  async function empezar(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await authClient.twoFactor.enable({ password });

    setPending(false);

    if (result.error) {
      // Mismo mensaje para contraseña incorrecta y para cualquier otro fallo: la
      // persona ya tiene sesión, así que aquí no hay nada que enumerar, pero
      // tampoco hace falta detallar por qué falló una contraseña.
      setError('No pudimos iniciar el registro. Compruebe su contraseña e inténtelo de nuevo.');
      return;
    }

    setPassword('');
    setSecreto({ totpURI: result.data.totpURI, backupCodes: result.data.backupCodes });
  }

  async function confirmar(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await authClient.twoFactor.verifyTotp({ code });

    setPending(false);

    if (result.error) {
      setError(
        'Ese código no es válido. Compruebe la hora de su dispositivo e inténtelo de nuevo.',
      );
      return;
    }

    /*
     * `verifyTotp` renueva la sesión con `twoFactorEnabled`. Sin `refresh` el
     * guardián seguiría leyendo la sesión vieja y devolvería aquí en bucle.
     */
    router.push('/admin');
    router.refresh();
  }

  if (secreto === null) {
    return (
      <form onSubmit={(event) => void empezar(event)} className="flex flex-col gap-4">
        {error !== null && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            <span aria-hidden="true">✕ </span>
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="mfa-password" className="text-sm font-medium">
            Confirme su contraseña
          </label>
          <input
            id="mfa-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-describedby="mfa-password-ayuda"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            className={inputClass}
          />
          <p id="mfa-password-ayuda" className="text-xs">
            Se pide para que nadie que encuentre su sesión abierta pueda cambiar su segundo factor.
          </p>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? 'Generando…' : 'Generar mi secreto'}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">1. Escanee este código</h2>
        <p className="text-sm">
          Abra su aplicación autenticadora y añada una cuenta nueva escaneando el código.
        </p>

        {qr === null ? (
          <p className="text-sm" role="status">
            Preparando el código… si no aparece, use la clave de abajo.
          </p>
        ) : (
          /*
           * `img` y no `next/image`: la fuente es una data URI generada en el
           * navegador, así que no hay nada que optimizar ni servir.
           *
           * `alt` vacío y no un texto descriptivo: la alternativa accesible de
           * un QR no es «código QR» —que no sirve de nada— sino la clave escrita
           * que va justo debajo y que cualquiera puede leer o copiar.
           */
          <img
            src={qr}
            alt=""
            width={220}
            height={220}
            className="rounded-md border border-[var(--color-ink)]/20 bg-white p-2"
          />
        )}

        <details className="text-sm">
          <summary className="cursor-pointer">No puedo escanear el código</summary>
          <p className="mt-2">
            En su aplicación elija «introducir clave manualmente» y escriba esto:
          </p>
          <code className="mt-1 block rounded-md border border-[var(--color-ink)]/20 p-3 font-mono text-sm break-all select-all">
            {secretoDe(secreto.totpURI)}
          </code>
        </details>
      </div>

      {/*
        DEC-014: los códigos de recuperación se guardan cifrados y esta es la
        única vez que se ven en claro. Si se pierden y se pierde el dispositivo,
        el restablecimiento es presencial y lo autoriza un ADMIN_MASTER.
      */}
      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">2. Guarde sus códigos de recuperación</h2>
        <p className="text-sm">
          <strong>No se volverán a mostrar.</strong> Son la única vía si pierde el dispositivo.
        </p>
        <ul className="grid grid-cols-2 gap-1 rounded-md border border-[var(--color-ink)]/20 p-3 font-mono text-sm">
          {secreto.backupCodes.map((codigo) => (
            <li key={codigo}>{codigo}</li>
          ))}
        </ul>
      </div>

      <form onSubmit={(event) => void confirmar(event)} className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">3. Confirme con un código</h2>

        {error !== null && (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            <span aria-hidden="true">✕ </span>
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="mfa-code" className="text-sm font-medium">
            Código de seis dígitos
          </label>
          <input
            id="mfa-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
            className={`${inputClass} font-mono tracking-widest`}
          />
          <p className="text-xs">
            Hasta que no lo confirme, el segundo factor no queda activado y esta pantalla seguirá
            apareciendo.
          </p>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? 'Comprobando…' : 'Activar el segundo factor'}
        </Button>
      </form>
    </div>
  );
}
