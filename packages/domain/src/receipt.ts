/**
 * Verificación pública de Comprobante de pago.
 *
 * DEC-003 y PAY-031: el QR abre una URL sin autenticación que confirma validez,
 * número, evento, fecha, monto, moneda y estado. `data-api-rbac.md` §7 enumera
 * lo que la respuesta pública **no** puede incluir: nombre, código de
 * inscripción, archivo bancario, cuenta receptora, referencia y usuario
 * aprobador.
 *
 * El detalle completo exige sesión y `receipt.read_sensitive` (PAY-032).
 */

/** Estado visible públicamente. Un comprobante anulado lo declara (PAY-033). */
export type PublicReceiptStatus = 'VALID' | 'VOID';

/**
 * Única forma en que un comprobante sale al público.
 *
 * Si aparece un campo nuevo aquí, tiene que estar autorizado por DEC-003.
 */
export interface PublicReceiptVerification {
  readonly number: string;
  readonly eventCode: string;
  readonly issuedAt: string;
  /**
   * Zona horaria de la gestión, para que la fecha pueda leerse.
   *
   * No es un dato nuevo que se revele: DEC-003 autoriza mostrar **la fecha**, y
   * un instante sin su zona no es una fecha. Sin esto la página imprimía el
   * sello UTC crudo, y para un cobro hecho por la tarde en La Paz eso anuncia
   * el día siguiente: quien contrastara el comprobante contra un extracto o
   * contra el cierre del día cuadraba con un día de diferencia (NFR-013).
   */
  readonly timezone: string;
  readonly amount: string;
  readonly currency: string;
  readonly status: PublicReceiptStatus;
}

/**
 * Campos permitidos en la respuesta pública.
 *
 * Se declara en tiempo de ejecución, no solo como tipo, para que la proyección
 * pueda comprobarse con una prueba en vez de confiar en el compilador.
 */
export const PUBLIC_RECEIPT_FIELDS = [
  'number',
  'eventCode',
  'issuedAt',
  'timezone',
  'amount',
  'currency',
  'status',
] as const satisfies readonly (keyof PublicReceiptVerification)[];

/**
 * Proyecta un comprobante interno a su forma pública.
 *
 * Construye el objeto campo por campo en lugar de copiar y borrar: así, un
 * campo nuevo en el registro interno queda fuera por omisión. Lo contrario
 * —copiar todo y eliminar lo sensible— filtra en cuanto alguien añade una
 * columna y olvida actualizar la lista.
 */
export function toPublicReceiptVerification(source: {
  readonly number: string;
  readonly eventCode: string;
  readonly issuedAt: Date | string;
  readonly timezone: string;
  readonly amount: string;
  readonly currency: string;
  readonly voidedAt?: Date | string | null;
}): PublicReceiptVerification {
  return {
    number: source.number,
    eventCode: source.eventCode,
    issuedAt: typeof source.issuedAt === 'string' ? source.issuedAt : source.issuedAt.toISOString(),
    timezone: source.timezone,
    amount: source.amount,
    currency: source.currency,
    status: source.voidedAt === undefined || source.voidedAt === null ? 'VALID' : 'VOID',
  };
}
