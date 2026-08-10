import 'server-only';

import type { PublicReceiptVerification } from '@encuentro/domain';
import { verifyReceipt } from '@encuentro/infrastructure';

import { prisma } from './container';

/**
 * Resultado de consultar un token de verificación.
 *
 * `unavailable` se conserva para el único caso en que sigue siendo cierto: que
 * falte `RECEIPT_VERIFICATION_SECRET` en el entorno. Sin la clave no se puede
 * calcular el HMAC, y responder «no encontrado» diría que el comprobante no
 * existe cuando lo que pasa es que este servidor está mal configurado.
 *
 * Hasta ahora era el **único** resultado posible: la función era un stub que
 * devolvía siempre `unavailable`, así que el QR de todo comprobante emitido
 * llevaba a una página diciendo que la verificación «se habilita en la fase de
 * pagos».
 */
export type VerificationResult =
  | { readonly kind: 'found'; readonly receipt: PublicReceiptVerification }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable' };

/**
 * Verifica un token de comprobante — PAY-031, DEC-003.
 *
 * El token es opaco y de alta entropía, y se compara por HMAC contra la columna
 * indexada: nunca viaja en claro a la base. La proyección pública la hace el
 * dominio y excluye nombre, código de inscripción, referencia, archivo bancario
 * y aprobador (`data-api-rbac.md` §7).
 *
 * **Sigue sin límite de intentos.** Es la superficie anónima del sistema y el
 * rate limit corresponde al proxy; el bloque del `Caddyfile` que dice ponerlo no
 * contiene ninguna directiva que lo haga. Anotado en el informe de revisión.
 */
export async function verifyReceiptToken(token: string): Promise<VerificationResult> {
  const secret = process.env.RECEIPT_VERIFICATION_SECRET;

  if (secret === undefined || secret === '') {
    return { kind: 'unavailable' };
  }

  return await verifyReceipt(prisma(), token, secret);
}
