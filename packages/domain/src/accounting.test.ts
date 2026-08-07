import { describe, expect, it } from 'vitest';

import {
  accountBalance,
  assertBalanced,
  entryDifference,
  isBalanced,
  isReconciled,
  reconciliationDifference,
  signedAmount,
  type JournalLine,
} from './accounting.js';
import { DomainError } from './errors.js';
import { money, toDecimalString } from './money.js';

const USD = (text: string) => money(text, 'USD');

const balanced: JournalLine[] = [
  { accountCode: '1010', side: 'DEBIT', amount: USD('350.00') },
  { accountCode: '4010', side: 'CREDIT', amount: USD('350.00') },
];

describe('partida doble — no es inferencia', () => {
  it('un asiento cuadrado tiene diferencia cero', () => {
    expect(isBalanced(balanced, 'USD')).toBe(true);
    expect(toDecimalString(entryDifference(balanced, 'USD'))).toBe('0.00');
  });

  it('cuadra con varias líneas a cada lado', () => {
    const lines: JournalLine[] = [
      { accountCode: '1010', side: 'DEBIT', amount: USD('200.00') },
      { accountCode: '1020', side: 'DEBIT', amount: USD('150.00') },
      { accountCode: '4010', side: 'CREDIT', amount: USD('350.00') },
    ];
    expect(isBalanced(lines, 'USD')).toBe(true);
  });

  it('detecta un descuadre de un céntimo', () => {
    const lines: JournalLine[] = [
      { accountCode: '1010', side: 'DEBIT', amount: USD('350.00') },
      { accountCode: '4010', side: 'CREDIT', amount: USD('349.99') },
    ];
    expect(isBalanced(lines, 'USD')).toBe(false);
    expect(toDecimalString(entryDifference(lines, 'USD'))).toBe('0.01');
  });

  it('rechaza un asiento de una sola línea', () => {
    const single: JournalLine[] = [{ accountCode: '1010', side: 'DEBIT', amount: USD('350.00') }];

    let thrown: unknown;
    try {
      assertBalanced(single, 'USD');
    } catch (error) {
      thrown = error;
    }
    expect((thrown as DomainError).code).toBe('ACCOUNTING_ENTRY_UNBALANCED');
  });

  it('rechaza un asiento descuadrado', () => {
    expect(() => {
      assertBalanced(
        [
          { accountCode: '1010', side: 'DEBIT', amount: USD('100.00') },
          { accountCode: '4010', side: 'CREDIT', amount: USD('90.00') },
        ],
        'USD',
      );
    }).toThrow(DomainError);
  });

  it('acepta el asiento cuadrado', () => {
    expect(() => {
      assertBalanced(balanced, 'USD');
    }).not.toThrow();
  });
});

describe('mecánica de saldos por naturaleza de cuenta', () => {
  it('un activo aumenta al debe', () => {
    expect(toDecimalString(signedAmount('ASSET', 'DEBIT', USD('100.00')))).toBe('100.00');
    expect(toDecimalString(signedAmount('ASSET', 'CREDIT', USD('100.00')))).toBe('-100.00');
  });

  it('un ingreso aumenta al haber', () => {
    expect(toDecimalString(signedAmount('INCOME', 'CREDIT', USD('100.00')))).toBe('100.00');
    expect(toDecimalString(signedAmount('INCOME', 'DEBIT', USD('100.00')))).toBe('-100.00');
  });

  it('un gasto se comporta como un activo', () => {
    expect(toDecimalString(signedAmount('EXPENSE', 'DEBIT', USD('50.00')))).toBe('50.00');
  });

  it('pasivo y patrimonio aumentan al haber', () => {
    expect(toDecimalString(signedAmount('LIABILITY', 'CREDIT', USD('50.00')))).toBe('50.00');
    expect(toDecimalString(signedAmount('EQUITY', 'CREDIT', USD('50.00')))).toBe('50.00');
  });

  it('el saldo se deriva de las líneas, no se almacena', () => {
    const balance = accountBalance(
      'ASSET',
      [
        { side: 'DEBIT', amount: USD('500.00') },
        { side: 'CREDIT', amount: USD('120.00') },
        { side: 'DEBIT', amount: USD('30.00') },
      ],
      'USD',
    );
    expect(toDecimalString(balance)).toBe('410.00');
  });

  it('sin movimientos el saldo es cero', () => {
    expect(toDecimalString(accountBalance('ASSET', [], 'USD'))).toBe('0.00');
  });
});

describe('conciliación de caja (PAY-012)', () => {
  it('cuadra cuando lo contado iguala lo registrado', () => {
    expect(isReconciled(USD('500.00'), USD('500.00'))).toBe(true);
  });

  it('un faltante da diferencia negativa', () => {
    expect(toDecimalString(reconciliationDifference(USD('500.00'), USD('495.00')))).toBe('-5.00');
    expect(isReconciled(USD('500.00'), USD('495.00'))).toBe(false);
  });

  it('un sobrante da diferencia positiva', () => {
    expect(toDecimalString(reconciliationDifference(USD('500.00'), USD('503.00')))).toBe('3.00');
  });
});
