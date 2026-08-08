import 'server-only';

import { DomainError } from '@encuentro/domain';

/**
 * Base para las acciones de servidor.
 *
 * Es el primer punto del sistema donde una mutación entra desde el navegador, y
 * por eso conviene fijar aquí tres cosas que no deben repetirse a mano en cada
 * acción:
 *
 *  1. **La autorización no vive aquí.** La hace el caso de uso, contra el
 *     dominio (GOV-006, IAM-010). Que una acción de servidor solo se invoque
 *     desde un botón que el usuario ve no es una garantía: el endpoint que Next
 *     genera es accesible directamente.
 *  2. **Un `DomainError` no es un fallo del sistema.** «Le falta saldo» o «otro
 *     revisor se adelantó» son respuestas legítimas que el usuario debe leer.
 *     Dejarlas escapar como excepción produciría una pantalla de error genérica
 *     que no dice nada.
 *  3. **Lo que no es `DomainError` se propaga.** Un fallo de conexión o un error
 *     de programación no deben disfrazarse de mensaje amable: tienen que llegar
 *     al registro y a la pantalla de error.
 */

export type ActionResult =
  { readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Ejecuta una mutación y traduce el rechazo del dominio a algo que la pantalla
 * pueda mostrar.
 *
 * No captura errores genéricos a propósito. Convertir cualquier excepción en un
 * mensaje amable esconde los fallos reales justo donde más caro es no verlos.
 */
export async function runAction(operation: () => Promise<void>): Promise<ActionResult> {
  try {
    await operation();
    return { ok: true };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, code: error.code, message: error.message };
    }

    throw error;
  }
}
