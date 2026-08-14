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

/**
 * Titularidad — PAY-021.
 *
 * El autoservicio no se resuelve con permisos. **El peregrino no tiene ninguna
 * asignación de rol**: DEC-014 se apoya precisamente en eso para eximirlo del
 * segundo factor. Así que `can()` devolvería `false` para cualquier permiso que
 * se le pidiera, y darle un rol para que pueda pagar lo suyo le daría también
 * alcance sobre lo ajeno.
 *
 * Lo que le autoriza es ser el titular. PAY-021 lo dice de forma literal: «el
 * autoservicio solo paga cargos propios», y separa ese caso del de caja y
 * tesorería, que sí operan por permiso y con pagador explícito.
 *
 * `ownerUserId` es nulo cuando la persona no tiene cuenta —IAM-012 admite
 * inscribir presencialmente sin correo—. Un titular sin cuenta no es titular de
 * nadie: nulo nunca autoriza.
 */
export function owns(actor: Actor, ownerUserId: string | null): boolean {
  return ownerUserId !== null && ownerUserId === actor.userId;
}

/** Igual que `owns`, pero falla con un error de dominio en lugar de devolver `false`. */
export function authorizeOwnership(actor: Actor, ownerUserId: string | null): void {
  if (!owns(actor, ownerUserId)) {
    // Mismo mensaje neutro que `authorize`, y por la misma razón: distinguir
    // «no es tuya» de «no existe» permitiría enumerar inscripciones ajenas.
    throw new DomainError('FORBIDDEN', 'La inscripción solicitada no está disponible.');
  }
}

/**
 * Permisos que tocan dinero.
 *
 * Es la lista que decide quién necesita segundo factor (DEC-019): mover,
 * revisar, anular o conciliar dinero. No están aquí los de solo lectura
 * —`payment.read`, `accounting.read`, `receipt.read`— porque mirar un importe
 * no lo cambia, y quien coordina una comisión suele necesitar ver lo que su
 * gente pagó.
 *
 * Se define como lista explícita y no como «todo lo que empiece por payment.»
 * a propósito: un prefijo arrastra cada permiso nuevo del dominio sin que nadie
 * lo haya pensado, y aquí la consecuencia de acertar de más es pedirle un
 * segundo factor a quien no debía, y la de acertar de menos es no pedírselo a
 * quien sí.
 */
export const MONEY_PERMISSIONS: readonly string[] = [
  'payment.proof.review',
  'payment.collect',
  'payment.adjust',
  'payment.refund',
  'receipt.issue',
  'receipt.void',
  'receipt.read_sensitive',
  'cash.open',
  'cash.collect',
  'cash.count',
  'cash.close',
  'accounting.manage',
  'accounting.reconcile',
  'accounting.close',
  'accounting.exchange_rate.manage',
];

/**
 * ¿Necesita esta cuenta segundo factor? — DEC-019, que acota DEC-014.
 *
 * DEC-014 lo exigía a **toda** cuenta con alguna asignación de rol. La
 * organización lo redujo el 14 de agosto de 2026 a dos grupos, al abrir el
 * módulo de servidores: ahí aparecen decenas de coordinadores de comisión que
 * no manejan dinero, y pedirles TOTP convertía el alta de cada uno en una
 * sesión de soporte.
 *
 * Quedan dentro:
 *
 *  - **el ámbito global**, que puede todo en todas las gestiones;
 *  - **quien toca dinero**, según `MONEY_PERMISSIONS`.
 *
 * Y queda fuera, dicho sin rodeos porque es el precio: un coordinador de
 * comisión entra solo con contraseña, y con ella aprueba o rechaza solicitudes,
 * asigna turnos y ve los datos personales de su gente. Si esa contraseña se
 * filtra, no hay segundo factor detrás. Es una decisión de la organización
 * sobre su propio riesgo, tomada a cambio de que el módulo sea operable.
 */
export function requiresSecondFactor(actor: Actor): boolean {
  return actor.assignments.some(
    (assignment) =>
      assignment.scope.type === 'GLOBAL' ||
      assignment.permissions.some((permission) => MONEY_PERMISSIONS.includes(permission)),
  );
}
