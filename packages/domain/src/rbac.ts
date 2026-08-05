import { DomainError } from './errors.js';

/**
 * Autorización por permiso y scope.
 *
 * `requirements.md` §10: RBAC con scopes global, gestión, comisión y caja.
 * GOV-006: toda mutación sensible valida permiso, scope, estado, versión e
 * idempotencia, y la API rechaza cualquier bypass de la UI.
 *
 * Este módulo es puro: decide, no consulta. Quién es el actor y qué roles tiene
 * lo resuelve la capa de aplicación.
 */

/** Nivel de alcance de una asignación de rol. */
export type ScopeType = 'GLOBAL' | 'EVENT' | 'COMMISSION' | 'CASH';

/**
 * Ámbito concreto de una asignación.
 *
 * `GLOBAL` no lleva identificador. Los demás sí, y siempre dentro de una
 * gestión: no existe una comisión ni una caja fuera de su `eventId` (GOV-001).
 */
export type Scope =
  | { readonly type: 'GLOBAL' }
  | { readonly type: 'EVENT'; readonly eventId: string }
  | { readonly type: 'COMMISSION'; readonly eventId: string; readonly commissionId: string }
  | { readonly type: 'CASH'; readonly eventId: string; readonly cashAccountId: string };

/** Contexto sobre el que se pide autorización. */
export type ResourceContext =
  | { readonly type: 'GLOBAL' }
  | { readonly type: 'EVENT'; readonly eventId: string }
  | { readonly type: 'COMMISSION'; readonly eventId: string; readonly commissionId: string }
  | { readonly type: 'CASH'; readonly eventId: string; readonly cashAccountId: string };

export interface RoleAssignment {
  readonly permissions: readonly string[];
  readonly scope: Scope;
}

export interface Actor {
  readonly userId: string;
  readonly assignments: readonly RoleAssignment[];
}

/**
 * Decide si un scope alcanza a un recurso.
 *
 * La contención va de lo ancho a lo estrecho: `GLOBAL` alcanza todo, `EVENT`
 * alcanza su gestión y lo que hay dentro, y `COMMISSION`/`CASH` alcanzan solo
 * su propio identificador.
 *
 * Lo importante es lo que **no** ocurre: un scope estrecho nunca alcanza hacia
 * arriba ni hacia los lados. Un cajero con permiso en `CAJA-01` no puede tocar
 * `CAJA-02` ni operar a nivel de gestión, aunque el permiso figure en su rol.
 */
export function scopeCovers(scope: Scope, resource: ResourceContext): boolean {
  if (scope.type === 'GLOBAL') return true;

  // Fuera de GLOBAL, todo vive dentro de una gestión: si no coincide, no alcanza.
  if (resource.type === 'GLOBAL') return false;
  if (scope.eventId !== resource.eventId) return false;

  switch (scope.type) {
    case 'EVENT':
      return true;

    case 'COMMISSION':
      return resource.type === 'COMMISSION' && resource.commissionId === scope.commissionId;

    case 'CASH':
      return resource.type === 'CASH' && resource.cashAccountId === scope.cashAccountId;
  }
}

/**
 * ¿Tiene el actor este permiso sobre este recurso?
 *
 * Exige que **una misma asignación** aporte a la vez el permiso y el alcance.
 * Comprobarlos por separado —tiene el permiso en algún sitio, y alcanza el
 * recurso por otro rol— es un error clásico de escalada: permitiría a un cajero
 * con `payment.collect` en su caja usarlo sobre otra donde solo tiene lectura.
 */
export function can(actor: Actor, permission: string, resource: ResourceContext): boolean {
  return actor.assignments.some(
    (assignment) =>
      assignment.permissions.includes(permission) && scopeCovers(assignment.scope, resource),
  );
}

/** Igual que `can`, pero falla con un error de dominio en lugar de devolver `false`. */
export function authorize(actor: Actor, permission: string, resource: ResourceContext): void {
  if (!can(actor, permission, resource)) {
    // El mensaje no revela si el recurso existe: responder distinto para un id
    // válido y uno inexistente convierte el error en un oráculo de enumeración.
    throw new DomainError('FORBIDDEN', `Falta el permiso ${permission} en el ámbito solicitado.`);
  }
}
