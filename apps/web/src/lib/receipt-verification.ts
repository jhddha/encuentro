import 'server-only';

import type { PublicReceiptVerification } from '@encuentro/domain';
import { verifyReceipt } from '@encuentro/infrastructure';
import { headers } from 'next/headers';

import { prisma } from './container';
import { checkRateLimit, clientKey } from './rate-limit';

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
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds: number };

/**
 * Verifica un token de comprobante — PAY-031, DEC-003.
 *
 * El token es opaco y de alta entropía, y se compara por HMAC contra la columna
 * indexada: nunca viaja en claro a la base. La proyección pública la hace el
 * dominio y excluye nombre, código de inscripción, referencia, archivo bancario
 * y aprobador (`data-api-rbac.md` §7).
 *
 * **El límite de ritmo se aplica antes de consultar**, no antes de renderizar.
 * Lo que hay que proteger es Postgres: el token no se adivina por fuerza bruta,
 * pero cada petición cuesta una consulta y la ruta es anónima. Ver
 * `checkRateLimit` para lo que ese límite cubre y lo que no.
 */
export async function verifyReceiptToken(token: string): Promise<VerificationResult> {
  const secret = process.env.RECEIPT_VERIFICATION_SECRET;

  if (secret === undefined || secret === '') {
    return { kind: 'unavailable' };
  }

  const limite = checkRateLimit(clientKey(await headers()));

  if (!limite.allowed) {
    return { kind: 'rate-limited', retryAfterSeconds: limite.retryAfterSeconds };
  }

  return await verifyReceipt(prisma(), token, secret);
}
