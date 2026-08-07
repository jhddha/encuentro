import {
  DomainError,
  money,
  toDecimalString,
  type Actor,
  type PriceVersion,
} from '@encuentro/domain';
import { describe, expect, it } from 'vitest';

import {
  formatRegistrationCode,
  prepareRegistration,
  type CreateRegistrationCommand,
  type RegistrationContext,
} from './create-registration.js';

const EVENT_ID = 'evt-1';
const NOW = new Date('2026-09-01T10:00:00Z');
const EVENT_START = new Date('2026-11-01T00:00:00Z');

const advanceVersion: PriceVersion = {
  id: 'pv-1',
  packageId: 'pkg-1',
  paymentMode: 'ADVANCE',
  amount: money('350.00', 'USD'),
  startsAt: new Date('2026-07-01T00:00:00Z'),
  endsAt: new Date('2026-10-15T23:59:59Z'),
  minPaymentPercent: 50,
};

const command: CreateRegistrationCommand = {
  eventId: EVENT_ID,
  personId: 'per-1',
  birthDate: new Date('1990-05-20T00:00:00Z'),
  packageId: 'pkg-1',
  priceVersionId: 'pv-1',
  fromPublicPortal: true,
};

const context: RegistrationContext = {
  eventStatus: 'ACTIVE',
  eventStartAt: EVENT_START,
  packageVisibility: 'PUBLIC',
  priceVersion: advanceVersion,
  hasExistingRegistration: false,
};

/**
 * Comprueba que la llamada lanza un `DomainError` con el código esperado.
 *
 * `expect(fn).toMatchObject({...})` compara la **función**, no lo que lanza, y
 * pasa siempre. Este helper obliga a que haya excepción y a que sea la correcta.
 */
function expectDomainError(fn: () => unknown, code: string): void {
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }

  expect(thrown, `se esperaba un DomainError ${code}`).toBeInstanceOf(DomainError);
  expect((thrown as DomainError).code).toBe(code);
}

function actorWith(permissions: readonly string[], eventId = EVENT_ID): Actor {
  return { userId: 'u-1', assignments: [{ permissions, scope: { type: 'EVENT', eventId } }] };
}

describe('alta correcta', () => {
  it('congela el cargo con las condiciones del momento (PAY-001)', () => {
    const draft = prepareRegistration(null, command, context, NOW);

    expect(draft.charge.packageId).toBe('pkg-1');
    expect(draft.charge.priceVersionId).toBe('pv-1');
    expect(draft.charge.paymentMode).toBe('ADVANCE');
    expect(toDecimalString(draft.charge.amount)).toBe('350.00');
    expect(draft.charge.frozenAt).toEqual(NOW);
  });

  it('admite inscripción durante IN_PROGRESS (GOV-003, EVT-005)', () => {
    const draft = prepareRegistration(
      null,
      command,
      { ...context, eventStatus: 'IN_PROGRESS' },
      NOW,
    );
    // Y por el mismo importe: no hay prorrateo (REG-023).
    expect(toDecimalString(draft.charge.amount)).toBe('350.00');
  });
});

describe('estado de la gestión (GOV-003, GOV-004)', () => {
  it.each(['DRAFT', 'READY'] as const)('rechaza inscripción en %s', (estado) => {
    expect(() =>
      prepareRegistration(null, command, { ...context, eventStatus: estado }, NOW),
    ).toThrow(/no admite inscripciones/);
  });

  it.each(['OPERATIONALLY_CLOSED', 'FINANCIALLY_CLOSED', 'ARCHIVED'] as const)(
    'rechaza inscripción en %s',
    (estado) => {
      expectDomainError(
        () => prepareRegistration(null, command, { ...context, eventStatus: estado }, NOW),
        'EVENT_OPERATIONS_BLOCKED',
      );
    },
  );
});

describe('edad mínima (DEC-006)', () => {
  it('rechaza a un menor', () => {
    const menor = { ...command, birthDate: new Date('2012-01-01T00:00:00Z') };
    expectDomainError(() => prepareRegistration(null, menor, context, NOW), 'MINOR_NOT_ALLOWED');
  });

  it('admite a quien cumple 18 antes del inicio aunque hoy tenga 17', () => {
    const casiMayor = { ...command, birthDate: new Date('2008-10-20T00:00:00Z') };
    expect(() => prepareRegistration(null, casiMayor, context, NOW)).not.toThrow();
  });

  it('rechaza a quien cumple 18 un día después del inicio', () => {
    const tarde = { ...command, birthDate: new Date('2008-11-02T00:00:00Z') };
    expectDomainError(() => prepareRegistration(null, tarde, context, NOW), 'MINOR_NOT_ALLOWED');
  });
});

describe('paquetes privados (PKG-009, PKG-010)', () => {
  const privado: RegistrationContext = { ...context, packageVisibility: 'PRIVATE' };

  it('el portal público no puede usarlos ni con permiso', () => {
    const conPermiso = actorWith(['catalog.private.assign']);
    expectDomainError(
      () => prepareRegistration(conPermiso, command, privado, NOW),
      'PRIVATE_PACKAGE_FORBIDDEN',
    );
  });

  it('Inscripciones con permiso sí puede asignarlo', () => {
    const conPermiso = actorWith(['catalog.private.assign']);
    const interno = { ...command, fromPublicPortal: false };
    expect(() => prepareRegistration(conPermiso, interno, privado, NOW)).not.toThrow();
  });

  it('sin el permiso no puede, aunque opere desde dentro', () => {
    const sinPermiso = actorWith(['registration.create']);
    const interno = { ...command, fromPublicPortal: false };
    expectDomainError(
      () => prepareRegistration(sinPermiso, interno, privado, NOW),
      'PRIVATE_PACKAGE_FORBIDDEN',
    );
  });

  it('el permiso en otra gestión no sirve — IDOR', () => {
    const otraGestion = actorWith(['catalog.private.assign'], 'evt-otro');
    const interno = { ...command, fromPublicPortal: false };
    expectDomainError(
      () => prepareRegistration(otraGestion, interno, privado, NOW),
      'PRIVATE_PACKAGE_FORBIDDEN',
    );
  });

  it('el scope GLOBAL sí alcanza', () => {
    const global: Actor = {
      userId: 'u-1',
      assignments: [{ permissions: ['catalog.private.assign'], scope: { type: 'GLOBAL' } }],
    };
    const interno = { ...command, fromPublicPortal: false };
    expect(() => prepareRegistration(global, interno, privado, NOW)).not.toThrow();
  });
});

describe('coherencia e unicidad', () => {
  it('rechaza una versión de precio de otro paquete', () => {
    const cruzado: RegistrationContext = {
      ...context,
      priceVersion: { ...advanceVersion, packageId: 'pkg-otro' },
    };
    expect(() => prepareRegistration(null, command, cruzado, NOW)).toThrow(/no pertenece/);
  });

  it('rechaza una segunda inscripción de la misma persona', () => {
    expect(() =>
      prepareRegistration(null, command, { ...context, hasExistingRegistration: true }, NOW),
    ).toThrow(/ya tiene una inscripción/);
  });
});

describe('código de inscripción', () => {
  it('usa seis dígitos con relleno', () => {
    expect(formatRegistrationCode('ENC2026', 1)).toBe('ENC2026-000001');
    expect(formatRegistrationCode('ENC2026', 42)).toBe('ENC2026-000042');
    expect(formatRegistrationCode('ENC2026', 123456)).toBe('ENC2026-123456');
  });
});
