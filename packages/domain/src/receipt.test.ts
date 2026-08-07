import { describe, expect, it } from 'vitest';

import { PUBLIC_RECEIPT_FIELDS, toPublicReceiptVerification } from './receipt.js';

/**
 * Registro interno con todo lo que `receipts` y su snapshot pueden contener
 * (data-api-rbac.md §2 y PAY-030). Los valores centinela son distinguibles para
 * poder afirmar que ninguno sobrevive a la proyección.
 */
const internalReceipt = {
  number: 'REC-ENC2026-000042',
  eventCode: 'ENC2026',
  issuedAt: new Date('2026-11-03T15:04:05.000Z'),
  amount: '350.00',
  currency: 'USD',

  // Todo lo que sigue es PII o dato sensible y no debe salir nunca.
  pilgrimName: 'PII-nombre-completo',
  registrationCode: 'PII-codigo-inscripcion',
  packageName: 'PII-paquete',
  payerName: 'PII-pagador',
  bankReference: 'PII-referencia-bancaria',
  receivingAccount: 'PII-cuenta-receptora',
  proofFileId: 'PII-archivo-bancario',
  approvedBy: 'PII-usuario-aprobador',
  verificationTokenHash: 'PII-hash-token',
};

describe('proyección pública de comprobante (PAY-031, data-api-rbac §7)', () => {
  it('expone exactamente los campos autorizados, ni uno más', () => {
    const publicView = toPublicReceiptVerification(internalReceipt);
    expect(Object.keys(publicView).sort()).toEqual([...PUBLIC_RECEIPT_FIELDS].sort());
  });

  it('no filtra ningún dato sensible del registro interno', () => {
    const serialized = JSON.stringify(toPublicReceiptVerification(internalReceipt));
    expect(serialized).not.toMatch(/PII-/);
  });

  it('no filtra PII aunque el registro interno gane campos nuevos', () => {
    // La proyección construye el objeto campo por campo, así que una columna
    // añadida más tarde queda fuera sin tocar este código.
    const withNewColumn = { ...internalReceipt, nationalId: 'PII-documento-identidad' };
    const serialized = JSON.stringify(toPublicReceiptVerification(withNewColumn));
    expect(serialized).not.toContain('PII-documento-identidad');
  });

  it('conserva los datos que la verificación pública sí debe mostrar', () => {
    expect(toPublicReceiptVerification(internalReceipt)).toEqual({
      number: 'REC-ENC2026-000042',
      eventCode: 'ENC2026',
      issuedAt: '2026-11-03T15:04:05.000Z',
      amount: '350.00',
      currency: 'USD',
      status: 'VALID',
    });
  });

  it('declara VOID cuando el comprobante fue anulado (PAY-033)', () => {
    const voided = { ...internalReceipt, voidedAt: new Date('2026-11-04T10:00:00.000Z') };
    expect(toPublicReceiptVerification(voided).status).toBe('VOID');
  });

  it('trata null y undefined en voidedAt como comprobante vigente', () => {
    expect(toPublicReceiptVerification({ ...internalReceipt, voidedAt: null }).status).toBe(
      'VALID',
    );
    expect(toPublicReceiptVerification({ ...internalReceipt, voidedAt: undefined }).status).toBe(
      'VALID',
    );
  });

  it('mantiene el importe como texto decimal, nunca como número', () => {
    // requirements.md §10: los montos usan decimal exacto, nunca `float`.
    const { amount } = toPublicReceiptVerification(internalReceipt);
    expect(typeof amount).toBe('string');
    expect(amount).toBe('350.00');
  });
});
