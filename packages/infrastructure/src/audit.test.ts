import { describe, expect, it } from 'vitest';

import { redact } from './audit.js';

describe('redacción de auditoría (regla 03-security-rbac)', () => {
  it('redacta claves sensibles de primer nivel', () => {
    expect(redact({ email: 'a@b.co', status: 'ACTIVE' })).toEqual({
      email: '[redactado]',
      status: 'ACTIVE',
    });
  });

  it('redacta sin importar mayúsculas', () => {
    expect(redact({ Email: 'a@b.co', PASSWORD: 'x', apiKey: 'k' })).toEqual({
      Email: '[redactado]',
      PASSWORD: '[redactado]',
      apiKey: '[redactado]',
    });
  });

  it('redacta en profundidad, no solo en la raíz', () => {
    const input = {
      registration: { person: { email: 'a@b.co', displayName: 'Ana' } },
      status: 'CONFIRMED',
    };

    expect(redact(input)).toEqual({
      registration: { person: { email: '[redactado]', displayName: 'Ana' } },
      status: 'CONFIRMED',
    });
  });

  it('recorre arrays', () => {
    expect(redact([{ token: 't1' }, { token: 't2' }])).toEqual([
      { token: '[redactado]' },
      { token: '[redactado]' },
    ]);
  });

  it('cubre campos anidados nuevos sin cambiar el código', () => {
    // Trabaja sobre la forma del objeto, no sobre rutas concretas.
    const input = { payment: { proof: { deep: { bankReference: 'REF-123' } } } };
    expect(JSON.stringify(redact(input))).not.toContain('REF-123');
  });

  it('conserva los valores no sensibles y sus tipos', () => {
    const input = { version: 3, status: 'ACTIVE', publiclyEnabled: true, reason: null };
    expect(redact(input)).toEqual(input);
  });

  it('deja pasar primitivas sin tocarlas', () => {
    expect(redact('texto')).toBe('texto');
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBeNull();
  });
});
