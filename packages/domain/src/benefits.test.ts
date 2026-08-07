import { describe, expect, it } from 'vitest';

import {
  decideMaterialDelivery,
  decideMealDelivery,
  deliveryIdempotencyKey,
  hasServiceAvailability,
  isWithinServiceWindow,
  stockFromMovements,
  type MealService,
} from './benefits.js';
import { DomainError } from './errors.js';

const service: MealService = {
  id: 'meal-1',
  serviceDate: new Date('2026-11-03T00:00:00Z'),
  type: 'LUNCH',
  startsAt: new Date('2026-11-03T16:00:00Z'),
  endsAt: new Date('2026-11-03T18:00:00Z'),
  availableCount: 500,
  deliveredCount: 0,
};

describe('ventana horaria de alimentación (FOD-001, FOD-006)', () => {
  it('acepta dentro de la ventana', () => {
    expect(isWithinServiceWindow(service, new Date('2026-11-03T17:00:00Z'))).toBe(true);
  });

  it('acepta justo al abrir y justo al cerrar', () => {
    // Quien llega a la hora de cierre alcanza a comer.
    expect(isWithinServiceWindow(service, service.startsAt)).toBe(true);
    expect(isWithinServiceWindow(service, service.endsAt)).toBe(true);
  });

  it('rechaza un minuto antes y un segundo después', () => {
    expect(isWithinServiceWindow(service, new Date('2026-11-03T15:59:00Z'))).toBe(false);
    expect(isWithinServiceWindow(service, new Date('2026-11-03T18:00:01Z'))).toBe(false);
  });

  it('rechaza el día equivocado aunque la hora coincida', () => {
    expect(isWithinServiceWindow(service, new Date('2026-11-04T17:00:00Z'))).toBe(false);
  });
});

describe('disponibilidad del servicio (FOD-001)', () => {
  it('hay cupos mientras lo entregado sea menor que lo disponible', () => {
    expect(hasServiceAvailability({ ...service, deliveredCount: 499 })).toBe(true);
    expect(hasServiceAvailability({ ...service, deliveredCount: 500 })).toBe(false);
  });

  it('un servicio sin cantidad configurada no entrega nada', () => {
    expect(hasServiceAvailability({ ...service, availableCount: 0, deliveredCount: 0 })).toBe(
      false,
    );
  });
});

describe('decisión de entrega de comida (FOD-006, FOD-003)', () => {
  const base = {
    service,
    moment: new Date('2026-11-03T17:00:00Z'),
    isEligible: true,
    alreadyDelivered: false,
  };

  it('entrega en el caso corriente', () => {
    expect(decideMealDelivery(base)).toEqual({ allowed: true });
  });

  it('rechaza una segunda entrega del mismo servicio', () => {
    // FOD-003: una persona recibe una vez cada servicio.
    expect(decideMealDelivery({ ...base, alreadyDelivered: true })).toEqual({
      allowed: false,
      reason: 'ALREADY_DELIVERED',
    });
  });

  it('rechaza fuera de horario', () => {
    expect(decideMealDelivery({ ...base, moment: new Date('2026-11-03T20:00:00Z') })).toEqual({
      allowed: false,
      reason: 'OUTSIDE_WINDOW',
    });
  });

  it('rechaza sin disponibilidad', () => {
    expect(decideMealDelivery({ ...base, service: { ...service, deliveredCount: 500 } })).toEqual({
      allowed: false,
      reason: 'CAPACITY_EXHAUSTED',
    });
  });

  it('la elegibilidad se comprueba antes que el horario', () => {
    // El operador de la estación necesita el motivo más útil: quien no tiene
    // derecho al servicio no debe recibir «fuera de horario».
    const decision = decideMealDelivery({
      ...base,
      isEligible: false,
      moment: new Date('2026-11-03T22:00:00Z'),
    });
    expect(decision.reason).toBe('NOT_ELIGIBLE');
  });
});

describe('materiales y llegada tardía (MAT-005, MAT-004)', () => {
  it('entrega el material incluido en el paquete', () => {
    expect(
      decideMaterialDelivery({
        includedInPackage: true,
        stockAvailable: true,
        alreadyDelivered: false,
      }),
    ).toEqual({ allowed: true });
  });

  it('la función no admite fecha de llegada', () => {
    // MAT-004: la llegada tardía no elimina el material incluido. Aceptar la
    // fecha invitaría a usarla para excluir a quien llega el último día.
    expect(decideMaterialDelivery).toHaveLength(1);
  });

  it('rechaza si no está incluido en el paquete', () => {
    expect(
      decideMaterialDelivery({
        includedInPackage: false,
        stockAvailable: true,
        alreadyDelivered: false,
      }).reason,
    ).toBe('NOT_ELIGIBLE');
  });

  it('rechaza una segunda entrega', () => {
    expect(
      decideMaterialDelivery({
        includedInPackage: true,
        stockAvailable: true,
        alreadyDelivered: true,
      }).reason,
    ).toBe('ALREADY_DELIVERED');
  });

  it('rechaza sin stock', () => {
    expect(
      decideMaterialDelivery({
        includedInPackage: true,
        stockAvailable: false,
        alreadyDelivered: false,
      }).reason,
    ).toBe('CAPACITY_EXHAUSTED');
  });
});

describe('stock derivado de movimientos (MAT-003)', () => {
  it('suma recepciones y resta entregas', () => {
    expect(
      stockFromMovements([
        { kind: 'RECEIPT', quantity: 100 },
        { kind: 'DELIVERY', quantity: 30 },
        { kind: 'DELIVERY', quantity: 20 },
      ]),
    ).toBe(50);
  });

  it('resta pérdidas y salidas', () => {
    expect(
      stockFromMovements([
        { kind: 'RECEIPT', quantity: 100 },
        { kind: 'LOSS', quantity: 5 },
        { kind: 'ISSUE', quantity: 10 },
      ]),
    ).toBe(85);
  });

  it('un ajuste lleva su propio signo', () => {
    expect(
      stockFromMovements([
        { kind: 'RECEIPT', quantity: 100 },
        { kind: 'ADJUSTMENT', quantity: -3 },
        { kind: 'ADJUSTMENT', quantity: 8 },
      ]),
    ).toBe(105);
  });

  it('sin movimientos el stock es cero', () => {
    expect(stockFromMovements([])).toBe(0);
  });

  it('es reconstruible: el mismo conjunto da siempre lo mismo', () => {
    const movements = [
      { kind: 'RECEIPT' as const, quantity: 40 },
      { kind: 'DELIVERY' as const, quantity: 7 },
    ];
    expect(stockFromMovements(movements)).toBe(stockFromMovements(movements));
  });
});

describe('idempotencia de entrega (ADR-008)', () => {
  it('combina estación y UUID de operación', () => {
    expect(deliveryIdempotencyKey('EST-01', 'abc-123')).toBe('EST-01:abc-123');
  });

  it('la misma operación produce la misma clave', () => {
    // Reintentar tras recuperar la conexión no debe entregar dos veces.
    expect(deliveryIdempotencyKey('EST-01', 'abc-123')).toBe(
      deliveryIdempotencyKey('EST-01', 'abc-123'),
    );
  });

  it('estaciones distintas producen claves distintas', () => {
    expect(deliveryIdempotencyKey('EST-01', 'abc')).not.toBe(
      deliveryIdempotencyKey('EST-02', 'abc'),
    );
  });

  it('rechaza datos vacíos', () => {
    expect(() => deliveryIdempotencyKey('', 'abc')).toThrow(DomainError);
    expect(() => deliveryIdempotencyKey('EST-01', '  ')).toThrow(DomainError);
  });
});
