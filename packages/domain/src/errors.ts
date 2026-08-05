/**
 * Errores de dominio.
 *
 * Los códigos son los declarados en `docs/02-architecture/data-api-rbac.md` §5
 * y en los invariantes de `requirements.md` §3. No inventar códigos nuevos sin
 * actualizar antes esa documentación (regla 01-no-guessing).
 */

export type DomainErrorCode =
  | 'EVENT_CONTEXT_REQUIRED'
  | 'EVENT_TRANSITION_INVALID'
  | 'EVENT_TRANSITION_REASON_REQUIRED'
  | 'EVENT_OPERATIONS_BLOCKED'
  | 'EVENT_VERSION_CONFLICT'
  | 'EVENT_DATES_INVALID'
  | 'FORBIDDEN';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
