import { DomainError } from './errors.js';

/**
 * Dinero.
 *
 * `requirements.md` §10: los montos usan decimal exacto, **nunca `float`**.
 * Aquí se representan como entero de unidades mínimas (centavos) más su moneda
 * ISO 4217. Guardar 350.00 como número de coma flotante introduce error en
 * cuanto se suma tres veces; guardar 35000 centavos no.
 *
 * La conversión desde y hacia texto decimal ocurre en los bordes: la base
 * guarda `Decimal`, la API transporta cadenas, y el dominio opera en enteros.
 */
export interface Money {
  /** Unidades mínimas. 350.00 USD son 35000. */
  readonly amount: number;
  /** Código ISO 4217 de tres letras. */
  readonly currency: string;
}

const DECIMAL_TEXT = /^-?\d+(\.\d{1,2})?$/;

/** Construye un importe desde texto decimal, que es como viaja por la API. */
export function money(decimalText: string, currency: string): Money {
  if (!DECIMAL_TEXT.test(decimalText)) {
    throw new DomainError('MONEY_INVALID', `Importe no válido: ${decimalText}`);
  }

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new DomainError('MONEY_INVALID', `Moneda no válida: ${currency}`);
  }

  const [whole = '0', fraction = ''] = decimalText.split('.');
  const negative = whole.startsWith('-');
  const cents = fraction.padEnd(2, '0');

  const units = Math.abs(Number.parseInt(whole, 10)) * 100 + Number.parseInt(cents, 10);

  return { amount: negative ? -units : units, currency };
}

/** Representación decimal, la forma en que se muestra y se transporta. */
export function toDecimalString(value: Money): string {
  const negative = value.amount < 0;
  const abs = Math.abs(value.amount);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;

  return `${negative ? '-' : ''}${String(whole)}.${String(cents).padStart(2, '0')}`;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    // Sumar monedas distintas sin conversión explícita es un error silencioso
    // que acaba en un estado de cuenta incorrecto.
    throw new DomainError(
      'MONEY_CURRENCY_MISMATCH',
      `No se pueden operar importes en ${a.currency} y ${b.currency} sin conversión explícita.`,
    );
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

export function sum(values: readonly Money[], currency: string): Money {
  return values.reduce<Money>((acc, value) => add(acc, value), { amount: 0, currency });
}

export function isZero(value: Money): boolean {
  return value.amount === 0;
}

export function isNegative(value: Money): boolean {
  return value.amount < 0;
}

export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amount - b.amount;
}

/**
 * ¿Alcanza `paid` el porcentaje mínimo de `total`?
 *
 * REG-020: el pago anticipado aprobado al 50% conserva la tarifa y habilita
 * elegir hotel. El umbral es configurable por versión de precio (PKG-013), así
 * que el 50 no está fijado aquí.
 *
 * Se compara `paid * 100 >= total * percent` con enteros, sin dividir, para no
 * introducir error de redondeo justo en la regla que decide un beneficio.
 */
export function meetsMinimumPercent(paid: Money, total: Money, percent: number): boolean {
  assertSameCurrency(paid, total);

  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new DomainError('MONEY_INVALID', `Porcentaje mínimo no válido: ${String(percent)}`);
  }

  return paid.amount * 100 >= total.amount * percent;
}
