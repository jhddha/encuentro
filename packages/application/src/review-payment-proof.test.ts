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
const BOB = 'BOB';

/** 6,96 bolivianos por dólar, en millonésimas. */
const TASA = 6_960_000;

function actor(permisos: readonly string[] = ['payment.proof.review']): Actor {
  return {
    userId: 'revisor-1',
    assignments: [{ permissions: permisos, scope: { type: 'EVENT', eventId: EVENTO } }],
  };
}

/**
 * Evidencia en la moneda de la gestión: no hay conversión de por medio.
 *
 * `exchangeRateMicros` es `null` a propósito y no 1 000 000. Un uno fingiría
 * una conversión que no ocurrió, y estas pruebas comprobarían la aritmética en
 * lugar del caso real, que es el que no convierte nada.
 */
function evidencia(overrides: Partial<ProofForReview> = {}): ProofForReview {
  return {
    id: EVIDENCIA,
    eventId: EVENTO,
    eventStatus: 'ACTIVE',
    registrationId: 'reg-1',
    status: 'UNDER_REVIEW',
    declared: money('420.00', USD),
    bookCurrency: USD,
    exchangeRateMicros: null,
    charges: [{ chargeId: 'c-1', outstanding: money('420.00', USD) }],
    duplicateReference: false,
    version: 2,
    ...overrides,
  };
}

/**
 * Evidencia en dólares contra libros en bolivianos: el caso que faltaba.
 *
 * Los cargos van en la moneda de la gestión, así que el reparto también. Es la
 * forma real del cobro internacional: una cuenta de Estados Unidos que recibe
 * dólares y unos libros que se llevan en bolivianos.
 */
function evidenciaEnDolares(overrides: Partial<ProofForReview> = {}): ProofForReview {
  return evidencia({
    declared: money('50.00', USD),
    bookCurrency: BOB,
    exchangeRateMicros: TASA,
    charges: [{ chargeId: 'c-1', outstanding: money('348.00', BOB) }],
    ...overrides,
  });
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
      // El comprobante emitido, con su token en claro: es lo único que lo
      // contendrá nunca. `null` significa que otra operación se adelantó.
      return Promise.resolve(
        aplica ? { number: 'REC-ENC2026-000001', verificationToken: 'tok_de_prueba' } : null,
      );
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
    const repo = repositorio(evidencia({ declared: money('500.00', USD) }));

    await reviewPaymentProof({ proofs: repo }, actor(), {
      ...comando,
      outcome: 'APPROVED',
      allocations: [{ chargeId: 'c-1', amount: money('420.00', USD) }],
    });

    expect(repo.aprobados[0]?.credit).toEqual(money('80.00', USD));
  });

  it('admite una asignación parcial', async () => {
    const repo = repositorio(evidencia({ declared: money('210.00', USD) }));

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
    const repo = repositorio(evidencia({ declared: money('100.00', USD) }));

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
        declared: money('500.00', USD),
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

/**
 * Cobro en otra moneda — DEC-009, con los libros en la moneda de la gestión.
 *
 * Es el eslabón que faltaba del multimoneda. La tasa ya se congelaba al cargar
 * la evidencia, pero al aprobar se usaba el importe **declarado** tal cual: con
 * reparto reventaba comparando dólares contra bolivianos, y sin reparto creaba
 * un pago con el número del dólar y la etiqueta del boliviano.
 */
describe('reviewPaymentProof — el importe entra en los libros convertido', () => {
  it('convierte con la tasa congelada y reparte en la moneda de la gestión', async () => {
    const repo = repositorio(evidenciaEnDolares());

    await reviewPaymentProof({ proofs: repo }, actor(), {
      ...comando,
      outcome: 'APPROVED',
      allocations: [{ chargeId: 'c-1', amount: money('348.00', BOB) }],
    });

    // 50.00 USD × 6,96 = 348.00 BOB. El pago entra en bolivianos.
    expect(repo.aprobados[0]?.amount).toEqual(money('348.00', BOB));
    expect(repo.aprobados[0]?.credit).toEqual(money('0.00', BOB));

    // Y lo declarado viaja junto al convertido, para el comprobante.
    expect(repo.aprobados[0]?.declared).toEqual(money('50.00', USD));
    expect(repo.aprobados[0]?.exchangeRateMicros).toBe(TASA);
  });

  /*
   * El caso que se corrompía en silencio. Sin reparto, el excedente entero
   * quedaba como saldo a favor: cincuenta dólares se anotaban como cincuenta
   * bolivianos y nadie se enteraba hasta el arqueo.
   */
  it('el saldo a favor también queda en la moneda de la gestión', async () => {
    const repo = repositorio(evidenciaEnDolares({ charges: [] }));

    await reviewPaymentProof({ proofs: repo }, actor(), {
      ...comando,
      outcome: 'APPROVED',
      allocations: [],
    });

    expect(repo.aprobados[0]?.credit).toEqual(money('348.00', BOB));
  });

  it('reparte parcialmente y deja el resto a favor, ya convertido', async () => {
    const repo = repositorio(
      evidenciaEnDolares({ charges: [{ chargeId: 'c-1', outstanding: money('200.00', BOB) }] }),
    );

    await reviewPaymentProof({ proofs: repo }, actor(), {
      ...comando,
      outcome: 'APPROVED',
      allocations: [{ chargeId: 'c-1', amount: money('200.00', BOB) }],
    });

    expect(repo.aprobados[0]?.credit).toEqual(money('148.00', BOB));
  });

  /*
   * Una evidencia multimoneda sin tasa congelada no es aprobable. Existe: son
   * las que se cargaron antes de que hubiera registro diario de tasas. El error
   * es propio y su mensaje trae el remedio, porque no es evidente —registrar la
   * tasa ahora no rellena una evidencia ya cargada.
   */
  it('no aprueba una evidencia multimoneda sin tasa congelada', async () => {
    const repo = repositorio(evidenciaEnDolares({ exchangeRateMicros: null }));

    await expect(
      reviewPaymentProof({ proofs: repo }, actor(), {
        ...comando,
        outcome: 'APPROVED',
        allocations: [{ chargeId: 'c-1', amount: money('348.00', BOB) }],
      }),
    ).rejects.toMatchObject({ code: 'EXCHANGE_RATE_MISSING' });

    expect(repo.aprobados).toHaveLength(0);
  });

  it('el rechazo por falta de tasa dice cómo resolverlo', async () => {
    const repo = repositorio(evidenciaEnDolares({ exchangeRateMicros: null }));

    await expect(
      reviewPaymentProof({ proofs: repo }, actor(), { ...comando, outcome: 'APPROVED' }),
    ).rejects.toThrow(/pida corrección/);
  });

  /*
   * Un reparto etiquetado en la moneda del canal es el error que cometía la
   * propia pantalla: enviaba la moneda de la evidencia. Antes llegaba como «no
   * se pueden operar importes en USD y BOB», que es cierto y no ayuda a nadie.
   */
  it('rechaza un reparto en la moneda del canal y dice cuál corresponde', async () => {
    const repo = repositorio(evidenciaEnDolares());

    await expect(
      reviewPaymentProof({ proofs: repo }, actor(), {
        ...comando,
        outcome: 'APPROVED',
        allocations: [{ chargeId: 'c-1', amount: money('50.00', USD) }],
      }),
    ).rejects.toThrow(/El reparto se anota en BOB/);

    expect(repo.aprobados).toHaveLength(0);
  });

  /*
   * Un céntimo de una divisa débil puede redondear a cero en la fuerte. El pago
   * de cero no llega a crearse: emitiría un comprobante numerado que no mueve
   * ningún saldo.
   */
  it('no aprueba cuando la conversión redondea a cero', async () => {
    const repo = repositorio(
      evidenciaEnDolares({
        declared: money('0.01', 'CLP'),
        // Un peso chileno vale unas 0,0072 unidades de la moneda del libro.
        exchangeRateMicros: 7_200,
        charges: [],
      }),
    );

    await expect(
      reviewPaymentProof({ proofs: repo }, actor(), {
        ...comando,
        outcome: 'APPROVED',
        allocations: [],
      }),
    ).rejects.toThrow(/redondean a cero/);
  });

  /* Y lo de siempre sigue igual: sin conversión, no se toca nada. */
  it('un cobro en la moneda de la gestión no se convierte', async () => {
    const repo = repositorio(evidencia());

    await reviewPaymentProof({ proofs: repo }, actor(), {
      ...comando,
      outcome: 'APPROVED',
      allocations: [{ chargeId: 'c-1', amount: money('420.00', USD) }],
    });

    expect(repo.aprobados[0]?.amount).toEqual(money('420.00', USD));
    expect(repo.aprobados[0]?.exchangeRateMicros).toBeNull();
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
