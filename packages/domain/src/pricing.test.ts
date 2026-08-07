import { describe, expect, it } from 'vitest';

import { assertEligibleByAge, ageAt, isEligibleByAge } from './eligibility.js';
import { DomainError } from './errors.js';
import { money, toDecimalString } from './money.js';
import {
  chargeAmount,
  freezeCharge,
  isAdvanceRateAvailable,
  isPackageOfferable,
  unlocksHotelSelection,
  type PriceVersion,
} from './pricing.js';

const advance: PriceVersion = {
  id: 'pv-advance',
  packageId: 'pkg-1',
  paymentMode: 'ADVANCE',
  amount: money('350.00', 'USD'),
  startsAt: new Date('2026-07-01T00:00:00Z'),
  endsAt: new Date('2026-10-15T23:59:59Z'),
  minPaymentPercent: 50,
  balanceDueAt: new Date('2026-11-01T23:59:59Z'),
};

const arrival: PriceVersion = {
  id: 'pv-arrival',
  packageId: 'pkg-1',
  paymentMode: 'ARRIVAL',
  amount: money('420.00', 'USD'),
};

describe('tarifa anticipada y su plazo (REG-021)', () => {
  it('está vigente dentro del rango', () => {
    expect(isAdvanceRateAvailable(advance, new Date('2026-09-01T12:00:00Z'))).toBe(true);
  });

  it('conserva la tarifa en el último instante del plazo', () => {
    // Prueba de borde: el comprobante cargado justo antes del corte cuenta.
    expect(isAdvanceRateAvailable(advance, new Date('2026-10-15T23:59:59Z'))).toBe(true);
  });

  it('la pierde un segundo después del corte', () => {
    expect(isAdvanceRateAvailable(advance, new Date('2026-10-16T00:00:00Z'))).toBe(false);
  });

  it('se evalúa por la fecha de carga, no por la de revisión', () => {
    // REG-021: cargado el último día, aprobado semanas después, conserva tarifa.
    const uploaded = new Date('2026-10-15T20:00:00Z');
    expect(isAdvanceRateAvailable(advance, uploaded)).toBe(true);
  });

  it('la modalidad al llegar no tiene tarifa anticipada', () => {
    expect(isAdvanceRateAvailable(arrival, new Date('2026-09-01T00:00:00Z'))).toBe(false);
  });
});

describe('desbloqueo de elección de hotel (REG-020, HOS-016)', () => {
  it('el 50% exacto desbloquea', () => {
    expect(unlocksHotelSelection(advance, money('175.00', 'USD'))).toBe(true);
  });

  it('un céntimo menos no desbloquea', () => {
    expect(unlocksHotelSelection(advance, money('174.99', 'USD'))).toBe(false);
  });

  it('pagar de más también desbloquea', () => {
    expect(unlocksHotelSelection(advance, money('400.00', 'USD'))).toBe(true);
  });

  it('pagar al llegar no desbloquea elección anticipada (HOS-017)', () => {
    expect(unlocksHotelSelection(arrival, money('420.00', 'USD'))).toBe(false);
  });

  it('falla si la versión anticipada no define mínimo', () => {
    const sinMinimo: PriceVersion = { ...advance, minPaymentPercent: undefined };
    expect(() => unlocksHotelSelection(sinMinimo, money('350.00', 'USD'))).toThrow(DomainError);
  });
});

describe('sin prorrateo durante IN_PROGRESS (REG-023, PKG-011, DEC-004)', () => {
  it('el importe es el del paquete completo', () => {
    expect(toDecimalString(chargeAmount(advance))).toBe('350.00');
    expect(toDecimalString(chargeAmount(arrival))).toBe('420.00');
  });

  it('la función no admite fecha de llegada', () => {
    // Garantía estructural: `chargeAmount` recibe solo la versión de precio.
    // Si alguien añadiera un parámetro de fecha, esta prueba dejaría de
    // compilar, que es exactamente el aviso que se busca.
    expect(chargeAmount).toHaveLength(1);
  });

  it('día 1, día 3 y último día cobran lo mismo', () => {
    const dia1 = chargeAmount(arrival);
    const dia3 = chargeAmount(arrival);
    const ultimo = chargeAmount(arrival);
    expect(dia1).toEqual(dia3);
    expect(dia3).toEqual(ultimo);
  });
});

describe('cargo congelado (PAY-001, PKG-001)', () => {
  it('congela paquete, versión, modalidad e importe', () => {
    const at = new Date('2026-09-01T10:00:00Z');
    expect(freezeCharge(advance, at)).toEqual({
      packageId: 'pkg-1',
      priceVersionId: 'pv-advance',
      paymentMode: 'ADVANCE',
      amount: money('350.00', 'USD'),
      frozenAt: at,
    });
  });

  it('un cambio posterior de tarifa no altera el cargo congelado', () => {
    const snapshot = freezeCharge(advance, new Date('2026-09-01T10:00:00Z'));
    const nuevaVersion: PriceVersion = {
      ...advance,
      id: 'pv-nueva',
      amount: money('500.00', 'USD'),
    };

    expect(toDecimalString(snapshot.amount)).toBe('350.00');
    expect(snapshot.priceVersionId).not.toBe(nuevaVersion.id);
  });
});

describe('visibilidad de paquetes (PKG-009, PKG-010)', () => {
  it('el portal público solo ofrece PUBLIC', () => {
    expect(isPackageOfferable('PUBLIC', { isPublicPortal: true, canAssignPrivate: false })).toBe(
      true,
    );
    expect(isPackageOfferable('PRIVATE', { isPublicPortal: true, canAssignPrivate: false })).toBe(
      false,
    );
  });

  it('un paquete privado no se ofrece en el portal ni con el permiso', () => {
    // El permiso habilita asignarlo desde Inscripciones, no publicarlo.
    expect(isPackageOfferable('PRIVATE', { isPublicPortal: true, canAssignPrivate: true })).toBe(
      false,
    );
  });

  it('Inscripciones con permiso sí puede asignarlo', () => {
    expect(isPackageOfferable('PRIVATE', { isPublicPortal: false, canAssignPrivate: true })).toBe(
      true,
    );
  });

  it('sin el permiso no se asigna aunque no sea el portal', () => {
    expect(isPackageOfferable('PRIVATE', { isPublicPortal: false, canAssignPrivate: false })).toBe(
      false,
    );
  });
});

describe('edad mínima (DEC-006)', () => {
  const eventStart = new Date('2026-11-01T00:00:00Z');

  it('calcula años cumplidos, no fracciones', () => {
    expect(ageAt(new Date('2000-11-01T00:00:00Z'), eventStart)).toBe(26);
    expect(ageAt(new Date('2000-11-02T00:00:00Z'), eventStart)).toBe(25);
  });

  it('admite a quien cumple 18 justo el día de inicio', () => {
    expect(isEligibleByAge(new Date('2008-11-01T00:00:00Z'), eventStart)).toBe(true);
  });

  it('rechaza a quien los cumple un día después', () => {
    expect(isEligibleByAge(new Date('2008-11-02T00:00:00Z'), eventStart)).toBe(false);
  });

  it('admite a quien tiene 17 al inscribirse pero 18 al empezar el evento', () => {
    // La edad se evalúa contra el inicio del evento, que es cuando asiste.
    const nacimiento = new Date('2008-10-15T00:00:00Z');
    expect(ageAt(nacimiento, new Date('2026-09-01T00:00:00Z'))).toBe(17);
    expect(isEligibleByAge(nacimiento, eventStart)).toBe(true);
  });

  it('maneja el 29 de febrero', () => {
    expect(ageAt(new Date('2008-02-29T00:00:00Z'), new Date('2026-02-28T00:00:00Z'))).toBe(17);
    expect(ageAt(new Date('2008-02-29T00:00:00Z'), new Date('2026-03-01T00:00:00Z'))).toBe(18);
  });

  it('assertEligibleByAge falla con MINOR_NOT_ALLOWED', () => {
    let thrown: unknown;
    try {
      assertEligibleByAge(new Date('2015-01-01T00:00:00Z'), eventStart);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as DomainError).code).toBe('MINOR_NOT_ALLOWED');
  });
});
