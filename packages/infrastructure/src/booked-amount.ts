import { bookAmount, money, toDecimalString, type BookingObstacle } from '@encuentro/domain';

/**
 * Lo declarado llevado a la moneda de los libros, para las consultas de lectura.
 *
 * Una consulta de pantalla **no puede lanzar** cuando falta la tasa: la bandeja
 * de comprobantes, el panel de revisión y el estado de cuenta del peregrino
 * tienen que dibujarse igualmente y *decir* que falta, que es exactamente lo que
 * permite resolverlo. Por eso usan `bookAmount`, que devuelve el obstáculo, y no
 * `requireBookedAmount`, que es la variante con la que la aprobación se niega.
 *
 * La regla de conversión es una sola y vive en el dominio. Esto es solo la
 * traducción de sus tipos a los de la base —`Decimal` como texto, `BIGINT` como
 * `bigint`— y está en un módulo propio porque lo necesitan tres consultas de dos
 * archivos distintos. Copiar la conversión en cada uno es cómo dos vistas del
 * mismo dinero acaban discrepando el día que una de las copias cambie.
 */
export interface ImporteEnLibros {
  /** Texto decimal ya convertido, o `null` si no se pudo calcular. */
  readonly booked: string | null;
  /** Por qué no se pudo. Lo que la pantalla traduce a un aviso con remedio. */
  readonly obstacle: BookingObstacle | null;
}

export function enLibros(input: {
  /** Importe declarado como texto decimal, tal como sale de `Decimal`. */
  readonly declaredText: string;
  readonly declaredCurrency: string;
  readonly bookCurrency: string;
  /** Tasa congelada. `BIGINT` en la base; el dominio opera con `number`. */
  readonly rateMicros: bigint | number | null;
}): ImporteEnLibros {
  const resultado = bookAmount({
    declared: money(input.declaredText, input.declaredCurrency),
    bookCurrency: input.bookCurrency,
    /*
     * La conversión de `bigint` se hace aquí, en la frontera, y no dejando que
     * se cuele en el cálculo: una cotización cabe de sobra en un entero seguro,
     * pero mezclar `bigint` y `number` en una multiplicación es un `TypeError`
     * en ejecución.
     */
    rateMicros: input.rateMicros === null ? null : Number(input.rateMicros),
  });

  return resultado.ok
    ? { booked: toDecimalString(resultado.amount), obstacle: null }
    : { booked: null, obstacle: resultado.obstacle };
}
