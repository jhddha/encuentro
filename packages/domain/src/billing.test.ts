import { describe, expect, it } from 'vitest';

import {
  ADVANCE_CHANNELS,
  ARRIVAL_CHANNELS,
  assertAllocationsWithinPayment,
  canTransitionProof,
  cashDifference,
  computeBalance,
  convert,
  creditFromOverpayment,
  formatReceiptNumber,
  isReviewable,
  unallocatedAmount,
} from './billing.js';
import { DomainError } from './errors.js';
import { money, toDecimalString } from './money.js';

const USD = (text: string) => money(text, 'USD');

describe('canales manuales (PAY-023, PAY-024, DEC-015)', () => {
  it('los canales anticipados son los tres declarados', () => {
    expect([...ADVANCE_CHANNELS]).toEqual([
      'BOLIVIA_QR_MANUAL',
      'US_ACCOUNT_MANUAL',
      'US_PAYMENT_LINK_MANUAL',
    ]);
  });

  it('todos los canales anticipados terminan en MANUAL', () => {
    // DEC-002 y DEC-015: ninguno confirma por su cuenta.
    for (const channel of ADVANCE_CHANNELS) {
      expect(channel.endsWith('_MANUAL')).toBe(true);
    }
  });

  it('al llegar se cobra en efectivo o por QR en caja', () => {
    expect([...ARRIVAL_CHANNELS]).toEqual(['CASH', 'CASH_QR']);
  });
});

describe('ciclo de la evidencia (PAY-025, PAY-026)', () => {
  it('la evidencia recorre carga, revisión y aprobación', () => {
    expect(canTransitionProof('PENDING_UPLOAD', 'SUBMITTED')).toBe(true);
    expect(canTransitionProof('SUBMITTED', 'UNDER_REVIEW')).toBe(true);
    expect(canTransitionProof('UNDER_REVIEW', 'APPROVED')).toBe(true);
  });

  it('no se aprueba sin pasar por revisión', () => {
    // PAY-025: subir evidencia no confirma el pago.
    expect(canTransitionProof('SUBMITTED', 'APPROVED')).toBe(false);
    expect(canTransitionProof('PENDING_UPLOAD', 'APPROVED')).toBe(false);
  });

  it('una evidencia aprobada es terminal', () => {
    // Rehacerla significaría anular el pago, que es otra operación (PAY-033).
    expect(canTransitionProof('APPROVED', 'REJECTED')).toBe(false);
    expect(canTransitionProof('APPROVED', 'UNDER_REVIEW')).toBe(false);
  });

  it('una corrección solicitada vuelve a revisión al reenviarse', () => {
    expect(canTransitionProof('CORRECTION_REQUESTED', 'SUBMITTED')).toBe(true);
  });

  it('solo SUBMITTED y UNDER_REVIEW son revisables', () => {
    expect(isReviewable('SUBMITTED')).toBe(true);
    expect(isReviewable('UNDER_REVIEW')).toBe(true);
    expect(isReviewable('APPROVED')).toBe(false);
    expect(isReviewable('REJECTED')).toBe(false);
    expect(isReviewable('CANCELLED')).toBe(false);
  });
});

describe('número de comprobante (PAY-014, DEC-003)', () => {
  it('usa el formato REC-{EVENT_CODE}-{NNNNNN}', () => {
    expect(formatReceiptNumber('ENC2026', 1)).toBe('REC-ENC2026-000001');
    expect(formatReceiptNumber('ENC2026', 42)).toBe('REC-ENC2026-000042');
    expect(formatReceiptNumber('ENC2026', 999999)).toBe('REC-ENC2026-999999');
  });

  it('rechaza secuencias no válidas', () => {
    expect(() => formatReceiptNumber('ENC2026', 0)).toThrow(DomainError);
    expect(() => formatReceiptNumber('ENC2026', -1)).toThrow(DomainError);
    expect(() => formatReceiptNumber('ENC2026', 1.5)).toThrow(DomainError);
  });
});

describe('saldo calculado (PAY-002)', () => {
  it('sin pagos, el saldo es UNPAID', () => {
    const balance = computeBalance({ charges: [USD('350.00')], allocations: [], currency: 'USD' });
    expect(balance.state).toBe('UNPAID');
    expect(toDecimalString(balance.outstanding)).toBe('350.00');
  });

  it('un pago parcial deja PARTIAL', () => {
    const balance = computeBalance({
      charges: [USD('350.00')],
      allocations: [USD('175.00')],
      currency: 'USD',
    });
    expect(balance.state).toBe('PARTIAL');
    expect(toDecimalString(balance.outstanding)).toBe('175.00');
  });

  it('el pago exacto deja PAID y saldo cero', () => {
    const balance = computeBalance({
      charges: [USD('350.00')],
      allocations: [USD('200.00'), USD('150.00')],
      currency: 'USD',
    });
    expect(balance.state).toBe('PAID');
    expect(toDecimalString(balance.outstanding)).toBe('0.00');
  });

  it('pagar de más deja OVERPAID con saldo negativo', () => {
    const balance = computeBalance({
      charges: [USD('350.00')],
      allocations: [USD('400.00')],
      currency: 'USD',
    });
    expect(balance.state).toBe('OVERPAID');
    expect(toDecimalString(balance.outstanding)).toBe('-50.00');
  });

  it('suma varios cargos sin perder céntimos', () => {
    const balance = computeBalance({
      charges: [USD('0.01'), USD('0.01'), USD('0.01')],
      allocations: [],
      currency: 'USD',
    });
    expect(toDecimalString(balance.charged)).toBe('0.03');
  });
});

describe('saldo a favor, nunca devolución (DEC-007, DEC-008)', () => {
  it('convierte el sobrepago en saldo a favor positivo', () => {
    const credit = creditFromOverpayment(USD('-50.00'));
    expect(toDecimalString(credit)).toBe('50.00');
  });

  it('sin sobrepago no hay saldo a favor', () => {
    expect(toDecimalString(creditFromOverpayment(USD('175.00')))).toBe('0.00');
    expect(toDecimalString(creditFromOverpayment(USD('0.00')))).toBe('0.00');
  });
});

describe('asignación de pagos (PAY-002)', () => {
  it('admite asignar parte del pago', () => {
    expect(() => {
      assertAllocationsWithinPayment(USD('200.00'), [USD('150.00')]);
    }).not.toThrow();
    expect(toDecimalString(unallocatedAmount(USD('200.00'), [USD('150.00')]))).toBe('50.00');
  });

  it('admite asignar el pago completo', () => {
    expect(() => {
      assertAllocationsWithinPayment(USD('200.00'), [USD('120.00'), USD('80.00')]);
    }).not.toThrow();
    expect(toDecimalString(unallocatedAmount(USD('200.00'), [USD('120.00'), USD('80.00')]))).toBe(
      '0.00',
    );
  });

  it('rechaza asignar más de lo pagado — crearía dinero', () => {
    let thrown: unknown;
    try {
      assertAllocationsWithinPayment(USD('200.00'), [USD('150.00'), USD('100.00')]);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as DomainError).code).toBe('PAYMENT_OVER_ALLOCATED');
  });

  it('detecta el exceso aunque sea de un céntimo', () => {
    expect(() => {
      assertAllocationsWithinPayment(USD('200.00'), [USD('200.01')]);
    }).toThrow(DomainError);
  });
});

describe('tasa de cambio congelada (DEC-009)', () => {
  it('convierte con la tasa dada', () => {
    // 1 USD = 6.96 BOB, expresado en millonésimas.
    expect(toDecimalString(convert(USD('100.00'), 'BOB', 6_960_000))).toBe('696.00');
  });

  it('redondea al céntimo de forma explícita', () => {
    expect(toDecimalString(convert(USD('10.00'), 'BOB', 6_965_000))).toBe('69.65');
    expect(toDecimalString(convert(USD('0.01'), 'BOB', 6_965_000))).toBe('0.07');
  });

  it('rechaza tasas no válidas', () => {
    expect(() => convert(USD('10.00'), 'BOB', 0)).toThrow(DomainError);
    expect(() => convert(USD('10.00'), 'BOB', -1)).toThrow(DomainError);
    expect(() => convert(USD('10.00'), 'BOB', 1.5)).toThrow(DomainError);
  });
});

describe('arqueo de caja (PAY-012)', () => {
  it('la diferencia se calcula, no se declara', () => {
    expect(toDecimalString(cashDifference(USD('500.00'), USD('495.00')))).toBe('-5.00');
    expect(toDecimalString(cashDifference(USD('500.00'), USD('505.00')))).toBe('5.00');
    expect(toDecimalString(cashDifference(USD('500.00'), USD('500.00')))).toBe('0.00');
  });
});
