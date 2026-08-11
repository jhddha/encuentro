import 'server-only';

import { authorize, type Actor, type ResourceContext } from '@encuentro/domain';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { actorResolver, eventRepository } from './container';
import { auth } from './auth';

/**
 * Resolución de sesión y autorización.
 *
 * ADR-010 marca la frontera: Better Auth responde **quién eres**;
 * `packages/domain/src/rbac.ts` responde **qué puedes hacer aquí**. Este módulo
 * es el único punto donde ambas cosas se juntan, y no toma ninguna decisión de
 * permisos por su cuenta.
 */

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly twoFactorEnabled: boolean;
}

/** Sesión actual, o `null` si no hay ninguna válida. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth().api.getSession({ headers: await headers() });
  if (session === null) return null;

  const user = session.user as {
    id: string;
    email: string;
    emailVerified: boolean;
    twoFactorEnabled?: boolean | null;
  };

  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled === true,
  };
}

/**
 * Exige sesión y devuelve el actor del dominio con sus asignaciones.
 *
 * Redirige, en este orden:
 *  1. sin sesión -> inicio de sesión;
 *  2. correo sin verificar -> aviso de verificación (DEC-013);
 *  3. personal sin MFA -> registro del segundo factor (DEC-014).
 *
 * El orden importa: exigir MFA a quien todavía no ha verificado su correo le
 * dejaría sin forma de recuperar la cuenta.
 */
export async function requireActor(): Promise<Actor> {
  const user = await currentUser();

  if (user === null) {
    redirect('/ingresar');
  }

  if (!user.emailVerified) {
    redirect('/verificar-correo');
  }

  const actor = await actorResolver().resolve(user.id);

  // `resolve` devuelve null si la cuenta no está ACTIVE. Una cuenta suspendida
  // con sesión viva no debe conservar permisos hasta que la sesión caduque.
  if (actor === null) {
    redirect('/ingresar');
  }

  // DEC-014: el segundo factor es obligatorio para toda cuenta con al menos una
  // asignación de rol. El peregrino, sin asignaciones, queda fuera.
  if (actor.assignments.length > 0 && !user.twoFactorEnabled) {
    redirect('/configurar-mfa');
  }

  return actor;
}

/**
 * Adónde pertenece quien no tiene ninguna asignación de rol.
 *
 * `IAM-003` no da un rol a la cuenta: los permisos salen de las asignaciones.
 * Sin ninguna, no existe permiso que conceder, así que `/admin` no es una
 * pantalla vacía para esa persona sino una pantalla que no le corresponde.
 *
 * La gestión se resuelve por la única habilitada públicamente (EVT-004,
 * EVT-006), que es la misma que usa la portada. Si esa persona todavía no está
 * inscrita, `mi-cuenta` ya lo trata: lo dice y ofrece el enlace a la
 * inscripción. Sin ninguna gestión publicada no hay cuenta que enseñar y queda
 * la portada.
 *
 * Ninguna ruta nueva: las dos están en `contracts/routes.json`.
 */
export async function pilgrimHome(): Promise<string> {
  const event = await eventRepository().findPubliclyEnabled();

  return event === null ? '/' : `/e/${event.code}/mi-cuenta`;
}

/**
 * Exige sesión y un permiso concreto sobre un recurso.
 *
 * La comprobación la hace `authorize` del dominio, no esta función: aquí solo
 * se resuelve el actor y se delega.
 */
export async function requirePermission(
  permission: string,
  resource: ResourceContext,
): Promise<Actor> {
  const actor = await requireActor();
  authorize(actor, permission, resource);
  return actor;
}
