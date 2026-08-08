import { DomainError, money, type Actor } from '@encuentro/domain';
import { describe, expect, it } from 'vitest';

import {
  reviewPaymentProof,
  takeProofForReview,
  type ApproveProofInput,
  type PaymentProofRepository,
  type ProofForReview,
  type RecordReviewInput,
} from './review-payment-proof.js';

const EVENTO = 'evt-1';
const EVIDENCIA = 'proof-1';
const USD = 'USD';

function actor(permisos: readonly string[] = ['payment.proof.review']): Actor {
  return {
    userId: 'revisor-1',
    assignments: [{ permissions: permisos, scope: { type: 'EVENT', eventId: EVENTO } }],
  };
}

function evidencia(overrides: Partial<ProofForReview> = {}): ProofForReview {
  return {
    id: EVIDENCIA,
    eventId: EVENTO,
    eventStatus: 'ACTIVE',
    registrationId: 'reg-1',
    status: 'UNDER_REVIEW',
    amount: money('420.00', USD),
    charges: [{ chargeId: 'c-1', outstanding: money('420.00', USD) }],
    duplicateReference: false,
    version: 2,
    ...overrides,
  };
}

interface RepoFalso extends PaymentProofRepository {
  readonly aprobados: ApproveProofInput[];
  readonly revisiones: RecordReviewInput[];
  readonly tomadas: string[];
}

function repositorio(registro: ProofForReview | null, aplica = true): RepoFalso {
  const aprobados: ApproveProofInput[] = [];
  const revisiones: RecordReviewInput[] = [];
  const tomadas: string[] = [];

  return {
    aprobados,
    revisiones,
    tomadas,
    findForReview: () => Promise.resolve(registro),
    takeForReview: (input) => {
      tomadas.push(input.proofId);
      return Promise.resolve(aplica);
    },
    approve: (input) => {
      aprobados.push(input);
      return Promise.resolve(aplica);
    },
    recordReview: (input) => {
      revisiones.push(input);
      return Promise.resolve(aplica);
    },
  };
}

const comando = {
  eventId: EVENTO,
  proofId: EVIDENCIA,
  expectedVersion: 2,
} as const;

describe('takeProofForReview', () => {
  it('toma una evidencia enviada', async () => {
    const repo = repositorio(evidencia({ status: 'SUBMITTED' }));
    await takeProofForReview({ proofs: repo }, actor(), comando);
    expect(repo.tomadas).toEqual([EVIDENCIA]);
  });

  it('no vuelve a tomar una que ya está en revisión', async () => {
    const repo = repositorio(evidencia({ status: 'UNDER_REVIEW' }));
    await expect(takeProofForReview({ proofs: repo }, actor(), comando)).rejects.toThrow(
      /no puede tomarse para revisión/,
    );
    expect(repo.tomadas).toHaveLength(0);
  });

  it('no toma una ya aprobada', async () => {
    const repo = repositorio(evidencia({ status: 'APPROVED' }));
    await expect(takeProofForReview({ proofs: repo }, actor(), comando)).rejects.toThrow(
      DomainError,
    );
  });
});

describe('reviewPaymentProof — aprobación', () => {
  it('aprueba y asigna el importe completo al cargo', async () => {
    const repo = repositorio(evidencia());

    await reviewPaymentProof({ proofs: repo }, actor(), {
      ...comando,
      outcome: 'APPROVED',
      allocations: [{ chargeId: 'c-1', amount: money('420.00', USD) }],
    });

    expect(repo.aprobados).toHaveLength(1);
    expect(repo.aprobados[0]?.credit).toEqual(money('0.00', USD));
    expect(repo.aprobados[0]?.actorId).toBe('revisor-1');
  });

  /*
   * DEC-008: el excedente no es un error. Queda como saldo a favor, no se
   * devuelve ni se fuerza contra un cargo que no lo debe.
   */
  it('deja el excedente como saldo a favor', async () => {
    const repo = repositorio(evidencia({ amount: money('500.00', USD) }));

    await reviewPaymentProof({ proofs: repo }, actor(), {
      ...comando,
      outcome: 'APPROVED',
      allocations: [{ chargeId: 'c-1', amount: money('420.00', USD) }],
    });

    expect(repo.aprobados[0]?.credit).toEqual(money('80.00', USD));
  });

  it('admite una asignación parcial', async () => {
    const repo = repositorio(evidencia({ amount: money('210.00', USD) }));

    await reviewPaymentProof({ proofs: repo }, actor(), {
      ...comando,
      outcome: 'APPROVED',
      allocations: [{ chargeId: 'c-1', amount: money('210.00', USD) }],
    });

    expect(repo.aprobados).toHaveLength(1);
  });

  /* PAY-027: aprobar dos veces el mismo comprobante duplica un ingreso que nunca entró. */
  it('rechaza una referencia duplicada antes de tocar nada', async () => {
    const repo = repositorio(evidencia({ duplicateReference: true }));

    await expect(
      reviewPaymentProof({ proofs: repo }, actor(), {
        ...comando,
        outcome: 'APPROVED',
        allocations: [{ chargeId: 'c-1', amount: money('420.00', USD) }],
      }),
    ).rejects.toThrow(/ya existe en la gestión/);

    expect(repo.aprobados).toHaveLength(0);
  });

  it('rechaza asignar más de lo que entró', async () => {
    const repo = repositorio(evidencia({ amount: money('100.00', USD) }));

    await expect(
      reviewPaymentProof({ proofs: repo }, actor(), {
        ...comando,
        outcome: 'APPROVED',
        allocations: [{ chargeId: 'c-1', amount: money('420.00', USD) }],
      }),
    ).rejects.toThrow(/supera el importe del pago/);

    expect(repo.aprobados).toHaveLength(0);
  });

  it('rechaza asignar más de lo que el cargo debe', async () => {
    const repo = repositorio(
      evidencia({
        amount: money('500.00', USD),
        charges: [{ chargeId: 'c-1', outstanding: money('300.00', USD) }],
      }),
    );

    await expect(
      reviewPaymentProof({ proofs: repo }, actor(), {
        ...comando,
        outcome: 'APPROVED',
        allocations: [{ chargeId: 'c-1', amount: money('400.00', USD) }],
      }),
    ).rejects.toThrow(/supera su saldo pendiente/);
  });

  /* PAY-021: no existe asignación transversal silenciosa. */
  it('rechaza un cargo que no pertenece a la inscripción', async () => {
    const repo = repositorio(evidencia());

    await expect(
      reviewPaymentProof({ proofs: repo }, actor(), {
        ...comando,
        outcome: 'APPROVED',
        allocations: [{ chargeId: 'c-de-otro', amount: money('10.00', USD) }],
      }),
    ).rejects.toThrow(/no pertenece a la inscripción/);
  });

  it('rechaza aprobar sin haber tomado la evidencia para revisión', async () => {
    const repo = repositorio(evidencia({ status: 'SUBMITTED' }));

    await expect(
      reviewPaymentProof({ proofs: repo }, actor(), {
        ...comando,
        outcome: 'APPROVED',
        allocations: [{ chargeId: 'c-1', amount: money('420.00', USD) }],
      }),
    ).rejects.toThrow(/Tome la evidencia para revisión primero/);
  });
});

describe('reviewPaymentProof — rechazo y corrección', () => {
  it('rechaza con motivo', async () => {
    const repo = repositorio(evidencia());

    await reviewPaymentProof({ proofs: repo }, actor(), {
      ...comando,
      outcome: 'REJECTED',
      reason: 'El comprobante corresponde a otra cuenta.',
    });

    expect(repo.revisiones[0]?.outcome).toBe('REJECTED');
    expect(repo.revisiones[0]?.reason).toContain('otra cuenta');
  });

  /* PAY-026: un rechazo sin motivo deja al peregrino sin saber qué corregir. */
  it('no rechaza sin motivo', async () => {
    const repo = repositorio(evidencia());

    await expect(
      reviewPaymentProof({ proofs: repo }, actor(), { ...comando, outcome: 'REJECTED' }),
    ).rejects.toThrow(/exige un motivo registrado/);

    expect(repo.revisiones).toHaveLength(0);
  });

  it('no acepta un motivo en blanco', async () => {
    const repo = repositorio(evidencia());

    await expect(
      reviewPaymentProof({ proofs: repo }, actor(), {
        ...comando,
        outcome: 'CORRECTION_REQUESTED',
        reason: '   ',
      }),
    ).rejects.toThrow(/exige un motivo registrado/);
  });

  it('pide corrección con motivo', async () => {
    const repo = repositorio(evidencia());

    await reviewPaymentProof({ proofs: repo }, actor(), {
      ...comando,
      outcome: 'CORRECTION_REQUESTED',
      reason: 'La imagen está ilegible.',
    });

    expect(repo.revisiones[0]?.outcome).toBe('CORRECTION_REQUESTED');
  });
});

describe('reviewPaymentProof — acceso y estado de la gestión', () => {
  it('exige el permiso de revisión', async () => {
    const repo = repositorio(evidencia());

    await expect(
      reviewPaymentProof({ proofs: repo }, actor(['payment.read']), {
        ...comando,
        outcome: 'APPROVED',
      }),
    ).rejects.toThrow(DomainError);

    expect(repo.aprobados).toHaveLength(0);
  });

  it('no revela evidencias de otra gestión', async () => {
    const repo = repositorio(evidencia({ eventId: 'otro' }));

    await expect(
      reviewPaymentProof({ proofs: repo }, actor(), { ...comando, outcome: 'APPROVED' }),
    ).rejects.toThrow(/no está disponible/);
  });

  it.each(['OPERATIONALLY_CLOSED', 'FINANCIALLY_CLOSED', 'ARCHIVED'] as const)(
    'no revisa con la gestión en %s',
    async (estado) => {
      const repo = repositorio(evidencia({ eventStatus: estado }));

      await expect(
        reviewPaymentProof({ proofs: repo }, actor(), { ...comando, outcome: 'APPROVED' }),
      ).rejects.toThrow(/no admite revisión de pagos/);
    },
  );

  it('falla si otra operación se adelantó', async () => {
    const repo = repositorio(evidencia(), false);

    await expect(
      reviewPaymentProof({ proofs: repo }, actor(), {
        ...comando,
        outcome: 'APPROVED',
        allocations: [{ chargeId: 'c-1', amount: money('420.00', USD) }],
      }),
    ).rejects.toThrow(/cambió mientras preparaba/);
  });
});
