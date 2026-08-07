import { DomainError } from './errors.js';
import { isZero, subtract, sum, type Money } from './money.js';

/**
 * Contabilidad — P12.
 *
 * **Advertencia de procedencia.** No hay requisitos `ACC-*` en
 * `contracts/requirements.json`. Este módulo se construye por inferencia desde
 * el prompt P12 («partida doble simplificada, cuentas, conciliaciones,
 * rendiciones, donaciones y activos») y desde `system-architecture.md` §5.
 *
 * Hay una excepción importante: **la partida doble no es inferencia**. Que los
 * débitos igualen a los créditos es la definición del método, no una decisión
 * de este proyecto. Todo lo demás —qué cuentas existen, cómo se numeran, qué
 * asiento genera cada operación— sí lo es, y debe validarse contra la
 * documentación v2.6 antes de usarse en producción.
 *
 * Lo que este módulo **no** hace, por decisión del contrato: presupuestos ni
 * centros de costo visibles (requirements.md §2 los excluye del alcance v1).
 */

/**
 * Naturaleza de una cuenta.
 *
 * INFERIDO: los cinco tipos son los del método contable estándar. El plan de
 * cuentas concreto de la organización no está documentado.
 */
export type AccountKind = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

/** Lado del asiento. */
export type EntrySide = 'DEBIT' | 'CREDIT';

export interface JournalLine {
  readonly accountCode: string;
  readonly side: EntrySide;
  readonly amount: Money;
}

/**
 * ¿Está cuadrado el asiento?
 *
 * **No es inferencia:** un asiento descuadrado no es un asiento. Si esta regla
 * se relajara, la contabilidad dejaría de poder reconstruirse.
 */
export function entryDifference(lines: readonly JournalLine[], currency: string): Money {
  const debits = sum(
    lines.filter((l) => l.side === 'DEBIT').map((l) => l.amount),
    currency,
  );
  const credits = sum(
    lines.filter((l) => l.side === 'CREDIT').map((l) => l.amount),
    currency,
  );

  return subtract(debits, credits);
}

export function isBalanced(lines: readonly JournalLine[], currency: string): boolean {
  return isZero(entryDifference(lines, currency));
}

export function assertBalanced(lines: readonly JournalLine[], currency: string): void {
  if (lines.length < 2) {
    // Un asiento de una sola línea no puede cuadrar por definición.
    throw new DomainError(
      'ACCOUNTING_ENTRY_UNBALANCED',
      'Un asiento necesita al menos dos líneas.',
    );
  }

  const difference = entryDifference(lines, currency);

  if (!isZero(difference)) {
    throw new DomainError(
      'ACCOUNTING_ENTRY_UNBALANCED',
      `El asiento no cuadra: la diferencia entre débitos y créditos no es cero.`,
    );
  }
}

/**
 * Efecto de un movimiento sobre el saldo de una cuenta.
 *
 * INFERIDO en cuanto a qué cuentas usa la organización, pero la mecánica es
 * estándar: activos y gastos aumentan al debe; pasivos, patrimonio e ingresos
 * aumentan al haber.
 */
export function signedAmount(kind: AccountKind, side: EntrySide, amount: Money): Money {
  const increasesOnDebit = kind === 'ASSET' || kind === 'EXPENSE';
  const isIncrease = side === 'DEBIT' ? increasesOnDebit : !increasesOnDebit;

  return isIncrease ? amount : { amount: -amount.amount, currency: amount.currency };
}

/**
 * Saldo de una cuenta a partir de sus líneas.
 *
 * Igual que el stock en materiales y el saldo en facturación: se **deriva** de
 * los movimientos. No existe una columna de saldo que alguien pueda ajustar.
 */
export function accountBalance(
  kind: AccountKind,
  lines: readonly { readonly side: EntrySide; readonly amount: Money }[],
  currency: string,
): Money {
  return sum(
    lines.map((line) => signedAmount(kind, line.side, line.amount)),
    currency,
  );
}

/**
 * Conciliación de una sesión de caja contra lo registrado.
 *
 * PAY-012 sí es un requisito real: el cierre compara esperado contra contado y
 * la diferencia exige motivo. Esta función expresa la misma comparación desde
 * el lado contable.
 */
export function reconciliationDifference(booked: Money, counted: Money): Money {
  return subtract(counted, booked);
}

export function isReconciled(booked: Money, counted: Money): boolean {
  return isZero(reconciliationDifference(booked, counted));
}
