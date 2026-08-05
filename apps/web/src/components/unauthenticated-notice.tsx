import { StatusBadge } from '@encuentro/ui';

/**
 * Aviso de que el shell administrativo aún no exige sesión.
 *
 * DEC-016 sigue BLOCKING y es la que decide el mecanismo de autenticación, así
 * que P01 prohibió implementarla. Estas pantallas son de solo lectura y no
 * exponen PII, pero el hecho de que cualquiera pueda abrirlas no debe quedar
 * implícito: se declara en pantalla hasta que P04 lo resuelva.
 */
export function UnauthenticatedNotice() {
  return (
    <div
      role="note"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-warning)] p-3 text-sm"
    >
      <StatusBadge tone="warning">Sin autenticación</StatusBadge>
      <span>
        Estas pantallas todavía no exigen sesión: DEC-016 sigue pendiente. Son de solo lectura y la
        autorización por permiso y scope ya se aplica en la capa de aplicación.
      </span>
    </div>
  );
}
