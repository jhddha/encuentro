import { reviewPaymentProof, takeProofForReview } from '@encuentro/application';
import { money, type Actor } from '@encuentro/domain';
import { createPaymentProofRepository, type PrismaClient } from '@encuentro/infrastructure';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, seedEvent, testPrisma } from './helpers';

/**
 * Gate del circuito de revisión de pagos — PAY-025 … PAY-033.
 *
 * Las pruebas unitarias verifican las reglas con dobles. Aquí se comprueba lo
 * único que la base puede demostrar: que aprobar es **atómico**, que la
 * numeración de comprobantes no se duplica bajo concurrencia, y que un fallo a
 * mitad no deja un pago sin comprobante.
 */
const prisma: PrismaClient = testPrisma();
const USD = 'USD';
const SECRETO = { verificationSecret: 'secreto-de-prueba-para-el-hmac-32chars' };

const repo = createPaymentProofRepository(prisma, SECRETO);

function actor(eventId: string): Actor {
  return {
    userId: REVISOR,
    assignments: [{ permissions: ['payment.proof.review'], scope: { type: 'EVENT', eventId } }],
  };
}

const REVISOR = '00000000-0000-4000-8000-0000000000bb';

interface Escenario {
  readonly eventId: string;
  readonly eventCode: string;
  readonly proofId: string;
  readonly chargeId: string;
  readonly proofVersion: number;
}

async function sembrar(
  options: { referencia?: string; importe?: string } = {},
): Promise<Escenario> {
  const event = await seedEvent(prisma, {
    code: `ENC-P${String(Math.floor(Math.random() * 100_000))}`,
    year: 2030 + Math.floor(Math.random() * 900),
    status: 'ACTIVE',
  });

  await prisma.user.upsert({
    where: { id: REVISOR },
    update: {},
    create: {
      id: REVISOR,
      email: `revisor-${event.code}@encuentro.invalid`,
      displayName: 'Revisor',
    },
  });

  const person = await prisma.person.create({
    data: { fullName: 'Peregrino Prueba', birthDate: new Date('1990-01-01') },
  });
  const pkg = await prisma.package.create({
    data: { eventId: event.id, code: 'GENERAL', name: 'General', visibility: 'PUBLIC' },
  });
  const price = await prisma.priceVersion.create({
    data: { packageId: pkg.id, paymentMode: 'ARRIVAL', amount: '420.00', currency: USD },
  });
  const registration = await prisma.registration.create({
    data: {
      eventId: event.id,
      code: `REG-${event.code}`,
      personId: person.id,
      packageId: pkg.id,
      priceVersionId: price.id,
      paymentMode: 'ARRIVAL',
      status: 'SUBMITTED',
    },
  });
  const charge = await prisma.charge.create({
    data: {
      registrationId: registration.id,
      concept: 'PACKAGE',
      amount: '420.00',
      currency: USD,
      snapshot: { packageCode: 'GENERAL' },
    },
  });
  const channel = await prisma.paymentChannel.create({
    data: { eventId: event.id, code: 'US_ACCOUNT_MANUAL', currency: USD },
  });
  const proof = await prisma.paymentProof.create({
    data: {
      eventId: event.id,
      registrationId: registration.id,
      channelId: channel.id,
      declaredAmount: options.importe ?? '420.00',
      currency: USD,
      paidAt: new Date(),
      reference: options.referencia ?? `REF-${event.code}`,
      status: 'SUBMITTED',
    },
  });

  return {
    eventId: event.id,
    eventCode: event.code,
    proofId: proof.id,
    chargeId: charge.id,
    proofVersion: proof.version,
  };
}

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('circuito completo de aprobación', () => {
  it('toma, aprueba, crea pago, asigna y emite comprobante', async () => {
    const e = await sembrar();

    await takeProofForReview({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: e.proofVersion,
    });

    const tomada = await prisma.paymentProof.findUniqueOrThrow({ where: { id: e.proofId } });
    expect(tomada.status).toBe('UNDER_REVIEW');

    await reviewPaymentProof({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: tomada.version,
      outcome: 'APPROVED',
      allocations: [{ chargeId: e.chargeId, amount: money('420.00', USD) }],
    });

    const aprobada = await prisma.paymentProof.findUniqueOrThrow({ where: { id: e.proofId } });
    expect(aprobada.status).toBe('APPROVED');
    expect(aprobada.reviewedBy).toBe(REVISOR);

    const pago = await prisma.payment.findFirstOrThrow({ where: { sourceProofId: e.proofId } });
    expect(pago.amount.toString()).toBe('420');
    expect(pago.status).toBe('SUCCEEDED');

    const asignaciones = await prisma.paymentAllocation.findMany({
      where: { paymentId: pago.id },
    });
    expect(asignaciones).toHaveLength(1);
    expect(asignaciones[0]?.chargeId).toBe(e.chargeId);

    // PAY-028 y PAY-014: comprobante numerado, con su formato.
    const comprobante = await prisma.receipt.findUniqueOrThrow({
      where: { paymentId: pago.id },
    });
    expect(comprobante.sequence).toBe(1);
    expect(comprobante.number).toBe(`REC-${e.eventCode}-000001`);

    // El token en claro nunca se guarda: solo su HMAC.
    expect(comprobante.verificationTokenHash).toMatch(/^[0-9a-f]{64}$/);

    const auditoria = await prisma.auditLog.findMany({
      where: { entity: 'payment_proof', entityId: e.proofId },
      orderBy: { createdAt: 'asc' },
    });
    expect(auditoria.map((a) => a.action)).toEqual([
      'payment.proof.take_for_review',
      'payment.proof.approve',
    ]);
  });

  /*
   * DEC-008: el excedente queda como saldo a favor y viaja en el comprobante.
   */
  it('registra el excedente como saldo a favor', async () => {
    const e = await sembrar({ importe: '500.00' });

    await takeProofForReview({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: e.proofVersion,
    });

    await reviewPaymentProof({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: e.proofVersion + 1,
      outcome: 'APPROVED',
      allocations: [{ chargeId: e.chargeId, amount: money('420.00', USD) }],
    });

    const pago = await prisma.payment.findFirstOrThrow({ where: { sourceProofId: e.proofId } });
    const comprobante = await prisma.receipt.findUniqueOrThrow({ where: { paymentId: pago.id } });

    expect(comprobante.snapshot).toMatchObject({ credit: '80.00' });
  });

  /*
   * La propiedad que hace fiable todo el circuito: si algo falla a mitad, no
   * queda ni pago ni comprobante. Un pago sin comprobante dejaría al peregrino
   * sin justificante de algo que sí pagó.
   *
   * Se fuerza el fallo con una asignación a un cargo inexistente, que muere
   * contra la clave foránea **después** de haber creado el pago.
   */
  it('no deja nada escrito si la transacción falla a mitad', async () => {
    const e = await sembrar();

    await takeProofForReview({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: e.proofVersion,
    });

    await expect(
      repo.approve({
        proofId: e.proofId,
        expectedVersion: e.proofVersion + 1,
        registrationId: (await prisma.paymentProof.findUniqueOrThrow({ where: { id: e.proofId } }))
          .registrationId,
        amount: money('420.00', USD),
        allocations: [
          { chargeId: '00000000-0000-4000-8000-00000000dead', amount: money('420.00', USD) },
        ],
        credit: money('0.00', USD),
        actorId: REVISOR,
      }),
    ).rejects.toThrow();

    expect(await prisma.payment.count({ where: { sourceProofId: e.proofId } })).toBe(0);
    expect(await prisma.receipt.count({ where: { eventId: e.eventId } })).toBe(0);

    // Y la evidencia sigue donde estaba, lista para reintentar.
    const evidencia = await prisma.paymentProof.findUniqueOrThrow({ where: { id: e.proofId } });
    expect(evidencia.status).toBe('UNDER_REVIEW');
  });

  /*
   * PAY-014: «concurrencia no duplica». `receipts` no tiene secuencia de base,
   * así que el número se calcula; el cerrojo de aviso por gestión es lo que hace
   * que dos aprobaciones simultáneas obtengan 1 y 2 en vez de chocar.
   */
  it('numera sin duplicar bajo aprobaciones simultáneas', async () => {
    const e = await sembrar();

    const segundaProof = await prisma.paymentProof.create({
      data: {
        eventId: e.eventId,
        registrationId: (await prisma.paymentProof.findUniqueOrThrow({ where: { id: e.proofId } }))
          .registrationId,
        channelId: (await prisma.paymentChannel.findFirstOrThrow({ where: { eventId: e.eventId } }))
          .id,
        declaredAmount: '100.00',
        currency: USD,
        paidAt: new Date(),
        reference: `REF-2-${e.eventCode}`,
        status: 'UNDER_REVIEW',
      },
    });

    await takeProofForReview({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: e.proofVersion,
    });

    const registrationId = (
      await prisma.paymentProof.findUniqueOrThrow({ where: { id: e.proofId } })
    ).registrationId;

    await Promise.all([
      repo.approve({
        proofId: e.proofId,
        expectedVersion: e.proofVersion + 1,
        registrationId,
        amount: money('420.00', USD),
        allocations: [{ chargeId: e.chargeId, amount: money('420.00', USD) }],
        credit: money('0.00', USD),
        actorId: REVISOR,
      }),
      repo.approve({
        proofId: segundaProof.id,
        expectedVersion: segundaProof.version,
        registrationId,
        amount: money('100.00', USD),
        allocations: [],
        credit: money('100.00', USD),
        actorId: REVISOR,
      }),
    ]);

    const comprobantes = await prisma.receipt.findMany({
      where: { eventId: e.eventId },
      orderBy: { sequence: 'asc' },
      select: { sequence: true, number: true },
    });

    expect(comprobantes.map((r) => r.sequence)).toEqual([1, 2]);
    expect(new Set(comprobantes.map((r) => r.number)).size).toBe(2);
  });
});

describe('rechazo', () => {
  it('registra motivo y no crea pago', async () => {
    const e = await sembrar();

    await takeProofForReview({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: e.proofVersion,
    });

    await reviewPaymentProof({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: e.proofVersion + 1,
      outcome: 'REJECTED',
      reason: 'El comprobante corresponde a otra cuenta.',
    });

    const evidencia = await prisma.paymentProof.findUniqueOrThrow({ where: { id: e.proofId } });
    expect(evidencia.status).toBe('REJECTED');
    expect(evidencia.reviewReason).toContain('otra cuenta');
    expect(await prisma.payment.count({ where: { sourceProofId: e.proofId } })).toBe(0);
  });
});
