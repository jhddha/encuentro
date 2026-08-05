import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ATTENDANCE_STATES,
  EVENT_STATES,
  LODGING_STATES,
  PAYMENT_COMPUTED_STATES,
  PAYMENT_PROOF_STATES,
  PAYMENT_STATES,
  REGISTRATION_STATES,
  acceptsRegistrationsAndPayments,
  blocksOrdinaryOperations,
  canTransition,
  requiresReason,
} from './states.js';

const contractPath = fileURLToPath(new URL('../../../contracts/states.json', import.meta.url));
const contract = JSON.parse(readFileSync(contractPath, 'utf8')) as Record<string, string[]>;

describe('máquinas de estado frente a contracts/states.json', () => {
  const cases: readonly [string, readonly string[]][] = [
    ['event', EVENT_STATES],
    ['registration', REGISTRATION_STATES],
    ['paymentComputed', PAYMENT_COMPUTED_STATES],
    ['attendance', ATTENDANCE_STATES],
    ['payment', PAYMENT_STATES],
    ['paymentProof', PAYMENT_PROOF_STATES],
    ['lodging', LODGING_STATES],
  ];

  it.each(cases)('%s coincide exactamente con el contrato', (key, states) => {
    expect(states).toEqual(contract[key]);
  });

  it('cubre todas las máquinas del contrato, sin sobrantes', () => {
    // Si alguien añade una máquina al contrato y no la transcribe al dominio,
    // este test falla. Así se detectó y cerró el hallazgo H-01.
    expect(Object.keys(contract).filter((k) => k !== 'version')).toEqual(cases.map(([key]) => key));
  });

  it('distingue el estado del pago del saldo derivado', () => {
    // `payments.status` y el saldo calculado de la inscripción comparten el
    // nombre en lenguaje natural pero son máquinas distintas (requirements.md §4.2).
    expect(PAYMENT_STATES).not.toEqual(PAYMENT_COMPUTED_STATES);
    expect(PAYMENT_STATES).toContain('SUCCEEDED');
    expect(PAYMENT_COMPUTED_STATES).toContain('PAID');
  });
});

describe('transiciones de gestión (EVT-003, GOV-002)', () => {
  it('recorre el ciclo canónico completo', () => {
    expect(canTransition('DRAFT', 'READY')).toBe(true);
    expect(canTransition('READY', 'ACTIVE')).toBe(true);
    expect(canTransition('ACTIVE', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'OPERATIONALLY_CLOSED')).toBe(true);
    expect(canTransition('OPERATIONALLY_CLOSED', 'FINANCIALLY_CLOSED')).toBe(true);
    expect(canTransition('FINANCIALLY_CLOSED', 'ARCHIVED')).toBe(true);
  });

  it('permite volver de READY a DRAFT para corregir configuración', () => {
    expect(canTransition('READY', 'DRAFT')).toBe(true);
  });

  it('rechaza saltos y retrocesos no canónicos', () => {
    expect(canTransition('DRAFT', 'ACTIVE')).toBe(false);
    expect(canTransition('ACTIVE', 'DRAFT')).toBe(false);
    expect(canTransition('IN_PROGRESS', 'ACTIVE')).toBe(false);
    expect(canTransition('ARCHIVED', 'DRAFT')).toBe(false);
  });

  it('exige motivo para el cierre anticipado desde ACTIVE', () => {
    expect(requiresReason('ACTIVE', 'OPERATIONALLY_CLOSED')).toBe(true);
    expect(requiresReason('IN_PROGRESS', 'OPERATIONALLY_CLOSED')).toBe(false);
  });
});

describe('operación por estado (GOV-003, GOV-004)', () => {
  it('acepta inscripciones y pagos en ACTIVE e IN_PROGRESS', () => {
    expect(acceptsRegistrationsAndPayments('ACTIVE')).toBe(true);
    expect(acceptsRegistrationsAndPayments('IN_PROGRESS')).toBe(true);
  });

  it('no acepta inscripciones antes de publicar ni después de cerrar', () => {
    expect(acceptsRegistrationsAndPayments('DRAFT')).toBe(false);
    expect(acceptsRegistrationsAndPayments('READY')).toBe(false);
    expect(acceptsRegistrationsAndPayments('OPERATIONALLY_CLOSED')).toBe(false);
  });

  it('solo bloquea desde OPERATIONALLY_CLOSED en adelante', () => {
    expect(blocksOrdinaryOperations('IN_PROGRESS')).toBe(false);
    expect(blocksOrdinaryOperations('OPERATIONALLY_CLOSED')).toBe(true);
    expect(blocksOrdinaryOperations('FINANCIALLY_CLOSED')).toBe(true);
    expect(blocksOrdinaryOperations('ARCHIVED')).toBe(true);
  });
});
