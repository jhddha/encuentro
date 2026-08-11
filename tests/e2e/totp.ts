import { createHmac } from 'node:crypto';

/**
 * Código TOTP, para que la semilla pueda superar el segundo factor.
 *
 * Son veinte líneas y no una dependencia porque la única librería del árbol que
 * lo hace, `@better-auth/utils`, **no está declarada en ningún `package.json`**:
 * resuelve por el hoisting de pnpm. Funciona hoy y desaparece el día que cambie
 * el `hoistPattern`, sin que nada avise. Añadirla como dependencia propia sería
 * arrastrar un paquete entero para seis dígitos.
 *
 * Comprobado contra `auth.api.generateTOTP`: mismo código, mismo segundo.
 */

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIODO_SEGUNDOS = 30;
const DIGITOS = 6;

/**
 * Base32 sin relleno, que es como Better Auth escribe el secreto en la URI.
 *
 * El valor decodificado son los bytes de la clave HMAC: `createOTP` codifica el
 * secreto en base32 para la URI y luego firma con el texto original en UTF-8,
 * así que decodificar devuelve exactamente esos bytes.
 */
export function base32Decode(texto: string): Buffer {
  let bits = 0;
  let acumulado = 0;
  const salida: number[] = [];

  for (const caracter of texto.replace(/=+$/, '').toUpperCase()) {
    const valor = ALFABETO.indexOf(caracter);

    if (valor < 0) throw new Error(`Carácter fuera del alfabeto base32: ${caracter}`);

    acumulado = (acumulado << 5) | valor;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      salida.push((acumulado >> bits) & 0xff);
    }
  }

  return Buffer.from(salida);
}

/** El secreto viaja como parámetro de la URI `otpauth://`. */
export function secretoDeUri(totpURI: string): string {
  // `URL` no interpreta el esquema `otpauth:` como jerárquico y deja
  // `searchParams` vacío; se sustituye por uno que sí lo es.
  const parametro = new URL(totpURI.replace('otpauth://', 'https://')).searchParams.get('secret');

  if (parametro === null) throw new Error('La URI de TOTP no trae secreto');

  return parametro;
}

/** Un byte de la firma, o un error que dice cuál faltaba. */
function byte(firma: Buffer, indice: number): number {
  const valor = firma.at(indice);

  if (valor === undefined) {
    throw new Error(`La firma HMAC no llega al byte ${String(indice)}`);
  }

  return valor;
}

/** Código de seis dígitos para el instante dado. */
export function totp(clave: Buffer, ahora: number = Date.now()): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(ahora / 1000 / PERIODO_SEGUNDOS)));

  const firma = createHmac('sha1', clave).update(contador).digest();

  // Truncado dinámico (RFC 4226 §5.3): el último nibble elige el desplazamiento.
  const desplazamiento = byte(firma, firma.length - 1) & 0x0f;
  const binario =
    ((byte(firma, desplazamiento) & 0x7f) << 24) |
    ((byte(firma, desplazamiento + 1) & 0xff) << 16) |
    ((byte(firma, desplazamiento + 2) & 0xff) << 8) |
    (byte(firma, desplazamiento + 3) & 0xff);

  return String(binario % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

/** Segundos que le quedan de vida al código actual. */
export function segundosRestantes(ahora: number = Date.now()): number {
  return PERIODO_SEGUNDOS - (Math.floor(ahora / 1000) % PERIODO_SEGUNDOS);
}
