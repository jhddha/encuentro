import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Token de verificación del Comprobante de pago — PAY-031, DEC-003.
 *
 * El QR impreso lleva un identificador **opaco**: no contiene el número de
 * comprobante, ni el nombre, ni el importe. Quien lo fotografíe sin autorización
 * no obtiene nada legible (PAY-031 exige verificación pública sin PII).
 *
 * **En la base se guarda solo el HMAC**, nunca el token. La diferencia con un
 * hash simple importa: `sha256` de un token corto es reversible por fuerza bruta
 * con un volcado de la tabla, mientras que el HMAC necesita además la clave, y
 * esa vive en el entorno y no en la base. Es el mismo razonamiento que ya
 * gobierna `BACKUP_PASSPHRASE`: un secreto en base es un secreto en cada copia.
 */

/**
 * 32 bytes de aleatoriedad criptográfica.
 *
 * En base64url para que quepa en una URL sin escapado y el QR resultante no
 * crezca por caracteres codificados.
 */
const TOKEN_BYTES = 32;

export interface ReceiptToken {
  /** Valor en claro. Solo existe aquí y en el QR impreso; no se persiste. */
  readonly token: string;
  /** Lo único que llega a la base. */
  readonly hash: string;
}

export function hashReceiptToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

export function createReceiptToken(secret: string): ReceiptToken {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, hash: hashReceiptToken(token, secret) };
}

/**
 * Comparación en tiempo constante.
 *
 * La verificación pública es un endpoint anónimo y sin límite de intentos
 * práctico. Comparar con `===` filtra por tiempo cuántos caracteres coinciden,
 * que es exactamente la ayuda que no se le debe dar a quien prueba tokens.
 */
export function receiptTokenMatches(token: string, secret: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashReceiptToken(token, secret), 'hex');
  const stored = Buffer.from(storedHash, 'hex');

  if (candidate.length !== stored.length) return false;

  return timingSafeEqual(candidate, stored);
}
