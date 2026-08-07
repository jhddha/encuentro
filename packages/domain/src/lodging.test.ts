import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import {
  HELD_DURATION_MS,
  assertPolicyConsistent,
  hasAvailability,
  heldExpiresAt,
  remainingCapacity,
  reservationAfterArrival,
  shouldRelease,
  type LodgingPolicy,
} from './lodging.js';

const policy: LodgingPolicy = {
  eventId: 'evt-1',
  // Referencia actual: 7 noches. Es un dato de la gestión, no una constante.
  nightCount: 7,
  checkInDate: new Date('2026-11-01T00:00:00Z'),
  checkOutDate: new Date('2026-11-08T00:00:00Z'),
};

describe('política de noches configurable (HOS-011)', () => {
  it('acepta la referencia actual de 7 noches', () => {
    expect(() => {
      assertPolicyConsistent(policy);
    }).not.toThrow();
  });

  it('acepta otras cantidades de noches — nada está fijado', () => {
    expect(() => {
      assertPolicyConsistent({
        ...policy,
        nightCount: 3,
        checkOutDate: new Date('2026-11-04T00:00:00Z'),
      });
    }).not.toThrow();

    expect(() => {
      assertPolicyConsistent({
        ...policy,
        nightCount: 14,
        checkOutDate: new Date('2026-11-15T00:00:00Z'),
      });
    }).not.toThrow();
  });

  it('detecta una política cuyas fechas no cuadran con sus noches', () => {
    // Declara 7 noches pero las fechas abarcan 5: alguien configuró mal la
    // gestión, y conviene saberlo al guardar.
    expect(() => {
      assertPolicyConsistent({ ...policy, checkOutDate: new Date('2026-11-06T00:00:00Z') });
    }).toThrow(DomainError);
  });

  it('rechaza una política de cero noches', () => {
    expect(() => {
      assertPolicyConsistent({
        ...policy,
        nightCount: 0,
        checkOutDate: new Date('2026-11-01T00:00:00Z'),
      });
    }).toThrow(DomainError);
  });
});

describe('expiración de HELD (DEC-005)', () => {
  const created = new Date('2026-09-01T10:00:00Z');

  it('dura exactamente 30 minutos', () => {
    expect(HELD_DURATION_MS).toBe(30 * 60 * 1000);
    expect(heldExpiresAt(created).toISOString()).toBe('2026-09-01T10:30:00.000Z');
  });

  it('no libera antes del plazo', () => {
    expect(shouldRelease('HELD', created, new Date('2026-09-01T10:29:59Z'))).toBe(false);
  });

  it('libera al cumplirse el plazo', () => {
    expect(shouldRelease('HELD', created, new Date('2026-09-01T10:30:00Z'))).toBe(true);
  });
});

describe('una reserva CONFIRMED no se libera nunca (HOS-012, DEC-004)', () => {
  const created = new Date('2026-09-01T10:00:00Z');
  const mucho_despues = new Date('2027-01-01T00:00:00Z');

  it('no expira aunque pasen meses', () => {
    expect(shouldRelease('CONFIRMED', created, mucho_despues)).toBe(false);
  });

  it('no expira el primer día del evento con la persona ausente', () => {
    // El escenario que HOS-012 nombra explícitamente: no-show al inicio.
    expect(shouldRelease('CONFIRMED', created, new Date('2026-11-01T23:59:00Z'))).toBe(false);
  });

  it.each(['RELEASED', 'CANCELLED', 'EXPIRED'] as const)(
    'un estado %s tampoco vuelve a liberarse',
    (estado) => {
      expect(shouldRelease(estado, created, mucho_despues)).toBe(false);
    },
  );

  it('shouldRelease no admite la fecha de llegada real', () => {
    // Garantía estructural: acepta estado, creación y ahora. Nada más.
    // Aceptar la llegada real invitaría a usarla, y usarla sería justo la
    // regla que HOS-012 prohíbe.
    expect(shouldRelease).toHaveLength(3);
  });
});

describe('la llegada real no reescribe la reserva (HOS-013)', () => {
  it('devuelve la reserva intacta', () => {
    const reserva = { state: 'CONFIRMED' as const, nightCount: 7 };
    expect(reservationAfterArrival(reserva)).toEqual(reserva);
  });

  it('conserva las noches aunque la persona llegue el último día', () => {
    const reserva = { state: 'CONFIRMED' as const, nightCount: 7 };
    // Llegar el día 7 no convierte la reserva en una noche.
    expect(reservationAfterArrival(reserva).nightCount).toBe(7);
  });
});

describe('disponibilidad por inventario (HOS-002)', () => {
  it('hay sitio mientras la ocupación sea menor que la capacidad', () => {
    expect(hasAvailability(10, 9)).toBe(true);
    expect(hasAvailability(10, 10)).toBe(false);
    expect(hasAvailability(10, 11)).toBe(false);
  });

  it('el último cupo sigue estando disponible', () => {
    expect(hasAvailability(1, 0)).toBe(true);
    expect(remainingCapacity(1, 0)).toBe(1);
  });

  it('la capacidad restante nunca es negativa', () => {
    expect(remainingCapacity(10, 15)).toBe(0);
  });
});
