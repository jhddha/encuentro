import { money, toDecimalString } from '@encuentro/domain';

/**
 * Texto decimal canónico a partir de una columna `Decimal` de Postgres.
 *
 * `Decimal.toString()` **quita los ceros finales**: una columna
 * `Decimal(12, 2)` que guarda `420.00` devuelve `"420"`. Da igual para operar
 * —`money("420", "USD")` da el mismo importe— pero no para mostrar: el estado
 * de cuenta enseñaría «420 USD» junto a «210.50 USD» y las columnas dejarían de
 * alinearse. Peor aún, un importe pensado como dinero exacto se leería como si
 * no tuviera céntimos.
 *
 * La conversión pasa por el dominio en vez de por `toFixed(2)`. `toFixed`
 * trabaja en coma flotante, que es justo lo que NFR-014 prohíbe para dinero, y
 * en importes grandes puede devolver el céntimo equivocado.
 */
export function decimalText(value: { toString(): string }, currency: string): string {
  return toDecimalString(money(value.toString(), currency));
}
