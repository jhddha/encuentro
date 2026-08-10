import { toPublicReceiptVerification, type PublicReceiptVerification } from '@encuentro/domain';

import { hashReceiptToken } from './receipt-token.js';
import type { PrismaClient } from './prisma.js';

/**
 * Verificación pública de Comprobante de pago — PAY-031, PAY-033, DEC-003.
 *
 * Es la **única** superficie del sistema accesible sin sesión que habla de una
 * transacción, así que todo aquí está escrito para dar lo mínimo:
 *
 *  - Se busca **por hash**, no por token. El HMAC del candidato se calcula y se
 *    compara contra la columna indexada; el valor en claro nunca viaja a la
 *    base ni aparece en un plan de consulta o un log de sentencias lentas.
 *  - La proyección la hace `toPublicReceiptVerification`, que construye la
 *    respuesta campo por campo. Una columna nueva en `receipts` no se filtra
 *    por omisión.
 *  - Un comprobante anulado **se declara anulado** (PAY-033) en vez de decir
 *    que no existe: quien tiene el papel en la mano merece saber por qué no
 *    vale.
 *
 * Sustituye a un stub que devolvía siempre `unavailable`. Mientras existió, el
 * QR de cada comprobante llevaba a una página que decía que la verificación
 * «se habilita en la fase de pagos» aunque el comprobante fuera real.
 */

export type ReceiptVerification =
  | { readonly kind: 'found'; readonly receipt: PublicReceiptVerification }
  | { readonly kind: 'not-found' };

/**
 * Cota de longitud del token candidato.
 *
 * 32 bytes en base64url son 43 caracteres. Se acota antes de tocar la base para
 * que una cadena arbitrariamente larga no se convierta en trabajo de HMAC ni en
 * una consulta: el endpoint es anónimo y conviene que lo barato sea barato.
 */
const MAX_TOKEN_LENGTH = 128;

export async function verifyReceipt(
  prisma: PrismaClient,
  token: string,
  secret: string,
): Promise<ReceiptVerification> {
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { kind: 'not-found' };
  }

  const receipt = await prisma.receipt.findUnique({
    where: { verificationTokenHash: hashReceiptToken(token, secret) },
    select: {
      number: true,
      issuedAt: true,
      voidedAt: true,
      snapshot: true,
      event: { select: { code: true } },
    },
  });

  if (receipt === null) return { kind: 'not-found' };

  /*
   * El importe sale del **snapshot** del comprobante, no del pago.
   *
   * PAY-033: el comprobante es inmutable y dice lo que decía al emitirse. Leer
   * el pago daría el importe de hoy, que tras una anulación y reemisión ya no
   * es el que lleva impreso el papel que la persona tiene delante.
   */
  const snapshot = receipt.snapshot as { amount?: unknown; currency?: unknown } | null;

  const amount = typeof snapshot?.amount === 'string' ? snapshot.amount : null;
  const currency = typeof snapshot?.currency === 'string' ? snapshot.currency : null;

  if (amount === null || currency === null) {
    /*
     * Un comprobante sin importe en su snapshot es un dato roto, no un
     * comprobante inválido. Se responde «no encontrado» —la respuesta pública
     * no es sitio para exponer un fallo interno— y el problema se ve en la
     * pantalla de auditoría, no aquí.
     */
    return { kind: 'not-found' };
  }

  return {
    kind: 'found',
    receipt: toPublicReceiptVerification({
      number: receipt.number,
      eventCode: receipt.event.code,
      issuedAt: receipt.issuedAt,
      amount,
      currency,
      voidedAt: receipt.voidedAt,
    }),
  };
}
