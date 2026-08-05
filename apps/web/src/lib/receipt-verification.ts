import type { PublicReceiptVerification } from '@encuentro/domain';

/**
 * Resultado de consultar un token de verificación.
 *
 * `unavailable` existe porque el servicio real llega en P07 junto con la tabla
 * `receipts`. Es un estado explícito y no un `null` ambiguo: la página debe
 * poder distinguir «este comprobante no existe» de «todavía no puedo
 * responder», y decirle al usuario la verdad en cada caso.
 */
export type VerificationResult =
  | { readonly kind: 'found'; readonly receipt: PublicReceiptVerification }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unavailable' };

/**
 * Verifica un token de comprobante.
 *
 * Contrato objetivo (P07): `GET /api/v1/public/receipts/verify/{token}`. El
 * token es opaco, de alta entropía, y se almacena por hash — nunca se compara
 * en claro contra la base (DEC-003, requirements.md §10).
 *
 * La comparación deberá ser de tiempo constante y el endpoint deberá ir tras
 * rate limit, porque es la única superficie del sistema accesible sin sesión.
 */
export function verifyReceiptToken(_token: string): VerificationResult {
  return { kind: 'unavailable' };
}
