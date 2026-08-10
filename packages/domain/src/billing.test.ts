import { describe, expect, it } from 'vitest';

import {
  ADVANCE_CHANNELS,
  ARRIVAL_CHANNELS,
  EVIDENCE_CONTENT_TYPES,
  EVIDENCE_MAX_BYTES,
  assertAllocationsWithinCharges,
  assertAllocationsWithinPayment,
  assertDeclarableEvidence,
  assertPayableAmount,
  canTransitionProof,
  cashDifference,
  computeBalance,
  convert,
  creditBalance,
  creditFromOverpayment,
  formatReceiptNumber,
  isReviewable,
  unallocatedAmount,
  type DeclaredEvidence,
} from './billing.js';
import { civilDayAnchor } from './civil-date.js';
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

describe('PAY-019 — importes positivos', () => {
  it('acepta un importe positivo', () => {
    expect(() => {
      assertPayableAmount(money('0.01', 'USD'), 'El pago');
    }).not.toThrow();
  });

  /*
   * Un pago negativo invertiría el sentido del cobro y descuadraría la caja sin
   * dejar rastro de una devolución, que además DEC-007 no admite en v1.
   */
  it('rechaza un importe negativo', () => {
    expect(() => {
      assertPayableAmount(money('-10.00', 'USD'), 'El pago');
    }).toThrow(/importe positivo/);
  });

  it('rechaza cero: un pago de cero no es un pago', () => {
    expect(() => {
      assertPayableAmount(money('0.00', 'USD'), 'El pago');
    }).toThrow(DomainError);
  });
});

describe('PAY-020 — la asignación no supera el saldo del cargo', () => {
  it('acepta asignar exactamente el saldo pendiente', () => {
    expect(() => {
      assertAllocationsWithinCharges([
        {
          chargeId: 'c-1',
          chargeOutstanding: money('420.00', 'USD'),
          amount: money('420.00', 'USD'),
        },
      ]);
    }).not.toThrow();
  });

  it('acepta una asignación parcial', () => {
    expect(() => {
      assertAllocationsWithinCharges([
        {
          chargeId: 'c-1',
          chargeOutstanding: money('420.00', 'USD'),
          amount: money('210.00', 'USD'),
        },
      ]);
    }).not.toThrow();
  });

  /*
   * Sin esta guarda, asignar 500 a un cargo de 300 dejaría el saldo de la
   * inscripción en negativo y la haría parecer un sobrepago que nadie hizo.
   */
  it('rechaza asignar más de lo que el cargo debe', () => {
    expect(() => {
      assertAllocationsWithinCharges([
        {
          chargeId: 'c-1',
          chargeOutstanding: money('300.00', 'USD'),
          amount: money('500.00', 'USD'),
        },
      ]);
    }).toThrow(/supera su saldo pendiente/);
  });

  it('rechaza el conjunto si una sola asignación se pasa', () => {
    expect(() => {
      assertAllocationsWithinCharges([
        {
          chargeId: 'c-1',
          chargeOutstanding: money('100.00', 'USD'),
          amount: money('100.00', 'USD'),
        },
        {
          chargeId: 'c-2',
          chargeOutstanding: money('50.00', 'USD'),
          amount: money('80.00', 'USD'),
        },
      ]);
    }).toThrow(/c-2/);
  });

  /*
   * El defecto que la revisión de la rama destapó: comprobando línea a línea,
   * cada mitad cabía por separado y entre las dos sobreasignaban el cargo.
   * `assertAllocationsWithinPayment` tampoco lo veía porque el total sí cabía
   * en el pago.
   */
  it('dos asignaciones al mismo cargo no lo sobreasignan', () => {
    const dosMitades = [
      {
        chargeId: 'c-1',
        chargeOutstanding: money('210.00', 'USD'),
        amount: money('210.00', 'USD'),
      },
      {
        chargeId: 'c-1',
        chargeOutstanding: money('210.00', 'USD'),
        amount: money('210.00', 'USD'),
      },
    ];

    // El pago de 420 admite el total: quien lo impide es el cargo, no el pago.
    expect(() => {
      assertAllocationsWithinPayment(
        USD('420.00'),
        dosMitades.map((a) => a.amount),
      );
    }).not.toThrow();

    let thrown: unknown;
    try {
      assertAllocationsWithinCharges(dosMitades);
    } catch (error) {
      thrown = error;
    }

    expect((thrown as DomainError).code).toBe('PAYMENT_OVER_ALLOCATED');
    expect((thrown as DomainError).message).toContain('c-1');
  });

  it('varias asignaciones al mismo cargo caben si juntas no lo superan', () => {
    expect(() => {
      assertAllocationsWithinCharges([
        {
          chargeId: 'c-1',
          chargeOutstanding: money('210.00', 'USD'),
          amount: money('110.00', 'USD'),
        },
        {
          chargeId: 'c-1',
          chargeOutstanding: money('210.00', 'USD'),
          amount: money('100.00', 'USD'),
        },
      ]);
    }).not.toThrow();
  });

  it('agrupa por cargo sin mezclar cargos distintos', () => {
    expect(() => {
      assertAllocationsWithinCharges([
        {
          chargeId: 'c-1',
          chargeOutstanding: money('100.00', 'USD'),
          amount: money('100.00', 'USD'),
        },
        {
          chargeId: 'c-2',
          chargeOutstanding: money('50.00', 'USD'),
          amount: money('50.00', 'USD'),
        },
      ]);
    }).not.toThrow();
  });

  it('rechaza una asignación negativa', () => {
    expect(() => {
      assertAllocationsWithinCharges([
        {
          chargeId: 'c-1',
          chargeOutstanding: money('100.00', 'USD'),
          amount: money('-10.00', 'USD'),
        },
      ]);
    }).toThrow(/importe positivo/);
  });
});

describe('evidencia declarada — PAY-018', () => {
  const AHORA = new Date('2026-08-08T12:00:00.000Z');

  /** Igual que hace la pantalla: un día civil, no un instante. */
  function anclar(dia: string): Date {
    const fecha = civilDayAnchor(dia);
    if (fecha === null) throw new Error(`día no válido en la prueba: ${dia}`);
    return fecha;
  }

  function evidencia(overrides: Partial<DeclaredEvidence> = {}): DeclaredEvidence {
    return {
      amount: USD('420.00'),
      paidAt: new Date('2026-08-07T15:00:00.000Z'),
      reference: 'TRF-88213',
      contentType: 'image/png',
      sizeBytes: 24_000,
      channelCurrency: 'USD',
      eventCurrency: 'USD',
      timezone: 'America/La_Paz',
      now: AHORA,
      ...overrides,
    };
  }

  it('acepta una declaración completa', () => {
    expect(() => {
      assertDeclarableEvidence(evidencia());
    }).not.toThrow();
  });

  it('acepta un pago declarado hoy mismo', () => {
    expect(() => {
      assertDeclarableEvidence(evidencia({ paidAt: AHORA }));
    }).not.toThrow();
  });

  it('rechaza un importe de cero o negativo (PAY-019)', () => {
    expect(() => {
      assertDeclarableEvidence(evidencia({ amount: USD('0.00') }));
    }).toThrow(/importe positivo/);

    expect(() => {
      assertDeclarableEvidence(evidencia({ amount: USD('-10.00') }));
    }).toThrow(/importe positivo/);
  });

  it('exige referencia', () => {
    expect(() => {
      assertDeclarableEvidence(evidencia({ reference: '   ' }));
    }).toThrow(/referencia bancaria es obligatoria/i);
  });

  it('rechaza una referencia desmesurada', () => {
    expect(() => {
      assertDeclarableEvidence(evidencia({ reference: 'X'.repeat(65) }));
    }).toThrow(/64 caracteres/);
  });

  /*
   * Una transferencia con fecha futura no ha ocurrido. Aceptarla permitiría
   * ocupar plaza contra dinero que quizá nunca salga.
   */
  it('rechaza una fecha futura', () => {
    expect(() => {
      assertDeclarableEvidence(evidencia({ paidAt: anclar('2026-08-09') }));
    }).toThrow(/no puede ser futura/);
  });

  /*
   * La regresión que motivó comparar días civiles y no instantes.
   *
   * A las 06:30 de La Paz ya es día 8 allí, pero solo las 10:30 UTC. Comparando
   * contra el reloj, el ancla del día 8 (mediodía UTC) queda «en el futuro» y el
   * peregrino no podía declarar el pago que acababa de hacer. El formulario, que
   * calcula su tope en la zona de la gestión, sí le ofrecía esa fecha.
   */
  it('acepta el pago de hoy a primera hora en la zona de la gestión', () => {
    const madrugadaEnLaPaz = new Date('2026-08-08T10:30:00.000Z');

    expect(() => {
      assertDeclarableEvidence(evidencia({ paidAt: anclar('2026-08-08'), now: madrugadaEnLaPaz }));
    }).not.toThrow();
  });

  it('sigue rechazando el día siguiente a esa misma hora', () => {
    expect(() => {
      assertDeclarableEvidence(
        evidencia({ paidAt: anclar('2026-08-09'), now: new Date('2026-08-08T10:30:00.000Z') }),
      );
    }).toThrow(/no puede ser futura/);
  });

  /*
   * Y el simétrico, hacia el este: en Yakarta (UTC+7) las 23:00 del día 8 son
   * las 16:00 UTC del mismo día, así que el ancla ya quedó atrás. Comparar por
   * día lo resuelve en ambas direcciones.
   */
  it('acepta el pago de hoy de madrugada en una zona al este', () => {
    expect(() => {
      assertDeclarableEvidence(
        evidencia({
          paidAt: anclar('2026-08-09'),
          timezone: 'Asia/Jakarta',
          now: new Date('2026-08-08T17:30:00.000Z'),
        }),
      );
    }).not.toThrow();
  });

  it('rechaza un tipo fuera de la lista blanca', () => {
    expect(() => {
      assertDeclarableEvidence(evidencia({ contentType: 'text/html' }));
    }).toThrow(/imagen .* o un PDF/);
  });

  it('admite los cuatro tipos declarados', () => {
    for (const contentType of EVIDENCE_CONTENT_TYPES) {
      expect(() => {
        assertDeclarableEvidence(evidencia({ contentType }));
      }).not.toThrow();
    }
  });

  it('rechaza un archivo vacío y uno de más de 10 MB', () => {
    expect(() => {
      assertDeclarableEvidence(evidencia({ sizeBytes: 0 }));
    }).toThrow(/vacío/);

    expect(() => {
      assertDeclarableEvidence(evidencia({ sizeBytes: EVIDENCE_MAX_BYTES + 1 }));
    }).toThrow(/10 MB/);

    expect(() => {
      assertDeclarableEvidence(evidencia({ sizeBytes: EVIDENCE_MAX_BYTES }));
    }).not.toThrow();
  });

  it('rechaza declarar en una moneda distinta a la del canal', () => {
    expect(() => {
      assertDeclarableEvidence(evidencia({ amount: money('420.00', 'BOB') }));
    }).toThrow(DomainError);
  });

  /*
   * DEC-009 dice congelar la tasa al cargar la evidencia, pero no existe tasa
   * configurada en ninguna parte del esquema. Sin fuente, convertir sería
   * inventar un número que acabaría en un comprobante emitido. La rama se
   * detiene aquí, no más adelante. Ver TBD-001.
   */
  it('detiene la rama multimoneda mientras no haya tasa configurada (DEC-009)', () => {
    let thrown: unknown;
    try {
      assertDeclarableEvidence(
        evidencia({ amount: money('2900.00', 'BOB'), channelCurrency: 'BOB' }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DomainError);
    expect((thrown as DomainError).code).toBe('MONEY_CURRENCY_MISMATCH');
    expect((thrown as DomainError).message).toMatch(/tasa de cambio/i);
  });
});

describe('saldo a favor acumulado — DEC-008', () => {
  it('es la parte cobrada que no se repartió', () => {
    const credito = creditBalance([USD('500.00')], [USD('420.00')], 'USD');
    expect(toDecimalString(credito)).toBe('80.00');
  });

  it('es cero cuando todo lo cobrado se repartió', () => {
    expect(toDecimalString(creditBalance([USD('420.00')], [USD('420.00')], 'USD'))).toBe('0.00');
  });

  it('es cero sin pagos', () => {
    expect(toDecimalString(creditBalance([], [], 'USD'))).toBe('0.00');
  });

  /*
   * Repartir más de lo cobrado ya lo impide `assertAllocationsWithinPayment`.
   * Si ocurriera pese a todo, mostrar el negativo como deuda del peregrino
   * sería peor que cortarlo: el descuadre debe verse en el arqueo.
   */
  it('nunca es negativo', () => {
    expect(toDecimalString(creditBalance([USD('100.00')], [USD('420.00')], 'USD'))).toBe('0.00');
  });

  /*
   * La otra mitad del mismo concepto: `computeBalance` compara cargos contra
   * asignaciones, y por PAY-020 ese saldo no puede salir negativo. Por eso el
   * sobrepago no aparece ahí y hace falta `creditBalance`.
   */
  it('el sobrepago no se ve en el saldo pendiente', () => {
    const balance = computeBalance({
      charges: [USD('420.00')],
      allocations: [USD('420.00')],
      currency: 'USD',
    });

    expect(toDecimalString(balance.outstanding)).toBe('0.00');
    expect(toDecimalString(creditBalance([USD('500.00')], [USD('420.00')], 'USD'))).toBe('80.00');
  });
});
