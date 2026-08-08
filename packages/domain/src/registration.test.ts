import { describe, expect, it } from 'vitest';

import { DomainError } from './errors.js';
import { money } from './money.js';
import { assertConfirmable, decideConfirmation, type ConfirmationInput } from './registration.js';
import { canTransitionRegistration } from './states.js';

const USD = 'USD';

function entrada(overrides: Partial<ConfirmationInput> = {}): ConfirmationInput {
  return {
    state: 'SUBMITTED',
    outstanding: money('0.00', USD),
    fullExemptionApproved: false,
    ...overrides,
  };
}

describe('REG-017 — confirmación de inscripción', () => {
  it('confirma con saldo cero', () => {
    expect(decideConfirmation(entrada())).toEqual({ outcome: 'CONFIRM' });
  });

  /*
   * El caso que la regla existe para impedir. Quien pagó parte del paquete no
   * está inscrito: sigue en SUBMITTED hasta saldar.
   */
  it('no confirma con saldo pendiente', () => {
    expect(decideConfirmation(entrada({ outstanding: money('150.00', USD) }))).toEqual({
      outcome: 'STAY_SUBMITTED',
      reason: 'OUTSTANDING_BALANCE',
    });
  });

  it('no confirma aunque falte un solo céntimo', () => {
    const decision = decideConfirmation(entrada({ outstanding: money('0.01', USD) }));
    expect(decision.outcome).toBe('STAY_SUBMITTED');
  });

  /*
   * DEC-008: el sobrepago queda como saldo a favor. Quien pagó de más no está
   * menos inscrito que quien pagó exacto.
   */
  it('confirma con sobrepago', () => {
    expect(decideConfirmation(entrada({ outstanding: money('-50.00', USD) }))).toEqual({
      outcome: 'CONFIRM',
    });
  });

  it('confirma con exención total aprobada aunque quede saldo', () => {
    expect(
      decideConfirmation(
        entrada({ outstanding: money('420.00', USD), fullExemptionApproved: true }),
      ),
    ).toEqual({ outcome: 'CONFIRM' });
  });

  describe('transiciones', () => {
    it('rechaza confirmar desde DRAFT: primero hay que enviar la inscripción', () => {
      expect(() => decideConfirmation(entrada({ state: 'DRAFT' }))).toThrow(DomainError);
      expect(() => decideConfirmation(entrada({ state: 'DRAFT' }))).toThrow(
        /No existe transición de DRAFT a CONFIRMED/,
      );
    });

    it('rechaza confirmar una inscripción cancelada', () => {
      expect(() => decideConfirmation(entrada({ state: 'CANCELLED' }))).toThrow(DomainError);
    });

    it('rechaza confirmar lo ya confirmado', () => {
      expect(() => decideConfirmation(entrada({ state: 'CONFIRMED' }))).toThrow(DomainError);
    });

    /* GOV-005: el histórico no se reescribe, así que CANCELLED es terminal. */
    it('CANCELLED es terminal', () => {
      for (const destino of ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'CANCELLED'] as const) {
        expect(canTransitionRegistration('CANCELLED', destino)).toBe(false);
      }
    });

    it('se puede cancelar desde cualquier estado vivo', () => {
      expect(canTransitionRegistration('DRAFT', 'CANCELLED')).toBe(true);
      expect(canTransitionRegistration('SUBMITTED', 'CANCELLED')).toBe(true);
      expect(canTransitionRegistration('CONFIRMED', 'CANCELLED')).toBe(true);
    });
  });

  describe('assertConfirmable', () => {
    it('no lanza cuando se puede confirmar', () => {
      expect(() => {
        assertConfirmable(entrada());
      }).not.toThrow();
    });

    it('lanza REGISTRATION_NOT_CONFIRMABLE con saldo pendiente', () => {
      try {
        assertConfirmable(entrada({ outstanding: money('10.00', USD) }));
        expect.unreachable('debía lanzar');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('REGISTRATION_NOT_CONFIRMABLE');
      }
    });
  });
});
