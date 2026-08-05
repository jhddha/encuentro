import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FORBIDDEN_PAYMENT_TERM, MICROCOPY } from './microcopy.js';

const designSystem = readFileSync(
  fileURLToPath(new URL('../../../docs/03-design/design-system.md', import.meta.url)),
  'utf8',
);

describe('microcopy frente a design-system.md §8', () => {
  it.each(Object.entries(MICROCOPY))(
    '«%s» sigue existiendo en el documento fuente',
    (_key, text) => {
      expect(designSystem).toContain(text);
    },
  );

  it('no usa «pago online», que sugeriría checkout automático', () => {
    // DEC-002 y PAY-001: v1 procesa pagos manuales verificados por una persona.
    const allCopy = Object.values(MICROCOPY).join(' ').toLowerCase();
    expect(allCopy).not.toContain(FORBIDDEN_PAYMENT_TERM);
  });

  it('el aviso de IN_PROGRESS no insinúa cierre de inscripciones', () => {
    // GOV-003 y EVT-005: durante IN_PROGRESS se sigue inscribiendo y pagando.
    expect(MICROCOPY.eventInProgress).toContain('continúan habilitados');
  });

  it('el aviso de anticipado pendiente no promete el beneficio antes de aprobar', () => {
    // PAY-005: subir evidencia no confirma el pago; solo APPROVED lo hace.
    expect(MICROCOPY.advancePending).toContain('cuando sea aprobado');
  });
});
