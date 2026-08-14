import 'server-only';

import { authorize, can as puede, type Actor, type ResourceContext } from '@encuentro/domain';
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
 * Revoca la sesión en curso, sin dejar que su fallo tape el motivo.
 *
 * Se llama justo antes de una redirección de expulsión, así que va aparte y con
 * su propio `catch`: `redirect` de Next funciona **lanzando**, y meterlo dentro
 * de este `try` haría que la propia redirección se tragara. Si la revocación
 * falla, expulsar sigue siendo lo correcto.
 */
async function revokeCurrentSession(): Promise<void> {
  try {
    await auth().api.signOut({ headers: await headers() });
  } catch {
    // Sin registro: aquí no hay nada accionable y el mensaje llevaría la
    // cabecera de sesión, que es material de credencial.
  }
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

  /*
   * `resolve` devuelve null si la cuenta no está ACTIVE. Una cuenta suspendida
   * con sesión viva no debe conservar permisos hasta que la sesión caduque.
   *
   * Redirigir sin más dejaba la sesión en pie, y con ella un ciclo del que no se
   * salía: la contraseña sigue siendo válida, así que quien volvía a entrar era
   * devuelto aquí y expulsado otra vez, sin que nada dijera por qué. IAM-008
   * pide que deshabilitar una cuenta impida operar, no solo que estorbe.
   */
  if (actor === null) {
    await revokeCurrentSession();
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

/**
 * ¿Tiene el actor este permiso? Sin lanzar.
 *
 * Para decidir **qué se dibuja**, no si se deja pasar. La pantalla de
 * hospedaje la abre quien tiene `lodging.read`, y dentro solo ve el inventario
 * quien además tiene `lodging.manage`: esconder un formulario que su acción va
 * a rechazar es más honesto que enseñarlo.
 *
 * No sustituye a la comprobación del caso de uso. Ocultar un botón no autoriza
 * nada: el endpoint que Next genera para la acción de servidor sigue siendo
 * invocable directamente, y quien decide es `authorize` allí dentro.
 */
export async function can(permission: string, resource: ResourceContext): Promise<boolean> {
  return puede(await requireActor(), permission, resource);
}
