import { createHash, randomBytes } from 'node:crypto';

import { computeBalance, formatReceiptNumber, money, toDecimalString } from '@encuentro/domain';
import type { PrismaClient } from '@encuentro/infrastructure';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, seedActor, seedEvent, testPrisma } from './helpers';

/**
 * Gate de P07: pago parcial, concurrencia de secuencia, anulación y ausencia
 * de PII en la verificación pública.
 */
const prisma: PrismaClient = testPrisma();

async function seedBillingContext(eventCode = 'ENC2026', year = 2026) {
  const event = await seedEvent(prisma, { code: eventCode, year, status: 'ACTIVE' });

  const { userId } = await seedActor(prisma, {
    email: `rev-${Math.random().toString(36).slice(2, 8)}@encuentro.test`,
    permissions: ['payment.proof.review', 'receipt.issue', 'receipt.void'],
    scopeType: 'GLOBAL',
  });

  const person = await prisma.person.create({
    data: { fullName: 'Ana Peregrina', birthDate: new Date('1990-05-20') },
  });

  const pkg = await prisma.package.create({
    data: { eventId: event.id, code: 'GENERAL', name: 'General', visibility: 'PUBLIC' },
  });

  const version = await prisma.priceVersion.create({
    data: { packageId: pkg.id, paymentMode: 'ARRIVAL', amount: '420.00', currency: 'USD' },
  });

  const registration = await prisma.registration.create({
    data: {
      eventId: event.id,
      code: 'ENC2026-000001',
      personId: person.id,
      packageId: pkg.id,
      priceVersionId: version.id,
      paymentMode: 'ARRIVAL',
      status: 'CONFIRMED',
    },
  });

  const charge = await prisma.charge.create({
    data: {
      registrationId: registration.id,
      concept: 'PACKAGE',
      amount: '420.00',
      currency: 'USD',
      snapshot: { amount: '420.00', currency: 'USD' },
    },
  });

  const channel = await prisma.paymentChannel.create({
    data: { eventId: event.id, code: 'BOLIVIA_QR_MANUAL', currency: 'USD' },
  });

  return { event, userId, person, registration, charge, channel };
}

/** Crea un pago aprobado con su comprobante, como haría el caso de uso real. */
async function issuePayment(ctx: Awaited<ReturnType<typeof seedBillingContext>>, amount: string) {
  return await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        eventId: ctx.event.id,
        registrationId: ctx.registration.id,
        amount,
        currency: 'USD',
        method: 'BOLIVIA_QR_MANUAL',
        approvedBy: ctx.userId,
      },
    });

    await tx.paymentAllocation.create({
      data: { paymentId: payment.id, chargeId: ctx.charge.id, amount, currency: 'USD' },
    });

    // La secuencia se cuenta dentro de la transacción; el índice único
    // (event_id, sequence) resuelve la carrera.
    const sequence = (await tx.receipt.count({ where: { eventId: ctx.event.id } })) + 1;

    const receipt = await tx.receipt.create({
      data: {
        eventId: ctx.event.id,
        paymentId: payment.id,
        sequence,
        number: formatReceiptNumber(ctx.event.code, sequence),
        snapshot: {
          // PAY-012: solo nombre, código de inscripción y paquete.
          pilgrimName: ctx.person.fullName,
          registrationCode: ctx.registration.code,
          packageName: 'General',
          amount,
          currency: 'USD',
        },
        verificationTokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
      },
    });

    return { payment, receipt };
  });
}

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

describe('pago parcial (PAY-008, PAY-009)', () => {
  it('un pago parcial genera su propio comprobante', async () => {
    const ctx = await seedBillingContext();
    const { receipt } = await issuePayment(ctx, '200.00');

    // PAY-009 es explícito: un pago parcial produce su propio comprobante.
    expect(receipt.number).toBe('REC-ENC2026-000001');
  });

  it('el saldo se deriva de las asignaciones, no se escribe', async () => {
    const ctx = await seedBillingContext();
    await issuePayment(ctx, '200.00');
    await issuePayment(ctx, '100.00');

    const allocations = await prisma.paymentAllocation.findMany({
      where: { chargeId: ctx.charge.id },
    });

    const balance = computeBalance({
      charges: [money('420.00', 'USD')],
      allocations: allocations.map((a) => money(a.amount.toFixed(2), 'USD')),
      currency: 'USD',
    });

    expect(balance.state).toBe('PARTIAL');
    expect(toDecimalString(balance.outstanding)).toBe('120.00');
  });

  it('pagar de más deja OVERPAID, y DEC-008 lo convierte en saldo a favor', async () => {
    const ctx = await seedBillingContext();
    await issuePayment(ctx, '500.00');

    const allocations = await prisma.paymentAllocation.findMany({
      where: { chargeId: ctx.charge.id },
    });
    const balance = computeBalance({
      charges: [money('420.00', 'USD')],
      allocations: allocations.map((a) => money(a.amount.toFixed(2), 'USD')),
      currency: 'USD',
    });

    expect(balance.state).toBe('OVERPAID');
    expect(toDecimalString(balance.outstanding)).toBe('-80.00');
  });
});

describe('secuencia de comprobante bajo concurrencia (PAY-010)', () => {
  it('cinco emisiones simultáneas no duplican número', async () => {
    const ctx = await seedBillingContext();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => issuePayment(ctx, '10.00')),
    );

    const emitidos = await prisma.receipt.findMany({
      where: { eventId: ctx.event.id },
      orderBy: { sequence: 'asc' },
    });

    // Las que colisionan fallan; ninguna duplica número.
    const numeros = emitidos.map((r) => r.number);
    expect(new Set(numeros).size).toBe(numeros.length);
    expect(new Set(emitidos.map((r) => r.sequence)).size).toBe(emitidos.length);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(emitidos.length);
  });

  it('la secuencia es por gestión, no global', async () => {
    const a = await seedBillingContext('ENC2026', 2026);
    const b = await seedBillingContext('ENC2027', 2027);

    const ra = await issuePayment(a, '50.00');
    const rb = await issuePayment(b, '50.00');

    // Cada gestión empieza en 1.
    expect(ra.receipt.sequence).toBe(1);
    expect(rb.receipt.sequence).toBe(1);
    expect(ra.receipt.number).not.toBe(rb.receipt.number);
  });

  it('rechaza un número que no corresponde a su secuencia', async () => {
    const ctx = await seedBillingContext();
    const payment = await prisma.payment.create({
      data: {
        eventId: ctx.event.id,
        amount: '10.00',
        currency: 'USD',
        method: 'BOLIVIA_QR_MANUAL',
        approvedBy: ctx.userId,
      },
    });

    await expect(
      prisma.receipt.create({
        data: {
          eventId: ctx.event.id,
          paymentId: payment.id,
          sequence: 7,
          number: 'REC-ENC2026-000003',
          snapshot: {},
          verificationTokenHash: 'hash-invalido',
        },
      }),
    ).rejects.toThrow();
  });
});

describe('inmutabilidad financiera (PAY-015, GOV-005)', () => {
  it('un pago no se puede modificar ni borrar', async () => {
    const ctx = await seedBillingContext();
    await issuePayment(ctx, '100.00');

    await expect(prisma.$executeRawUnsafe(`UPDATE payments SET amount = 1`)).rejects.toThrow(
      /inmutable/,
    );
    await expect(prisma.$executeRawUnsafe('DELETE FROM payments')).rejects.toThrow(/inmutable/);
  });

  it('una asignación tampoco', async () => {
    const ctx = await seedBillingContext();
    await issuePayment(ctx, '100.00');

    await expect(
      prisma.$executeRawUnsafe(`UPDATE payment_allocations SET amount = 1`),
    ).rejects.toThrow(/inmutable/);
  });

  it('un comprobante solo admite anulación', async () => {
    const ctx = await seedBillingContext();
    const { receipt } = await issuePayment(ctx, '100.00');

    // Cambiar el importe del snapshot está prohibido.
    await expect(
      prisma.$executeRawUnsafe(`UPDATE receipts SET number = 'REC-OTRO-000001'`),
    ).rejects.toThrow(/anulacion|inmutable/i);

    // Anular sí, con motivo y responsable.
    const anulado = await prisma.receipt.update({
      where: { id: receipt.id },
      data: {
        voidedAt: new Date(),
        voidedBy: ctx.userId,
        voidReason: 'Importe mal transcrito por el cajero',
      },
    });
    expect(anulado.voidedAt).not.toBeNull();
  });

  it('anular sin motivo se rechaza', async () => {
    const ctx = await seedBillingContext();
    const { receipt } = await issuePayment(ctx, '100.00');

    await expect(
      prisma.receipt.update({
        where: { id: receipt.id },
        data: { voidedAt: new Date(), voidedBy: ctx.userId },
      }),
    ).rejects.toThrow();
  });

  it('un comprobante ya anulado no admite más cambios', async () => {
    const ctx = await seedBillingContext();
    const { receipt } = await issuePayment(ctx, '100.00');

    await prisma.receipt.update({
      where: { id: receipt.id },
      data: { voidedAt: new Date(), voidedBy: ctx.userId, voidReason: 'Error de captura' },
    });

    await expect(
      prisma.receipt.update({
        where: { id: receipt.id },
        data: { voidReason: 'Otro motivo' },
      }),
    ).rejects.toThrow();
  });
});

describe('revisión de evidencia (PAY-005, PAY-006, PAY-007)', () => {
  it('rechaza dos evidencias con la misma referencia en una gestión', async () => {
    const ctx = await seedBillingContext();

    const base = {
      eventId: ctx.event.id,
      registrationId: ctx.registration.id,
      channelId: ctx.channel.id,
      declaredAmount: '100.00',
      currency: 'USD',
      paidAt: new Date(),
    };

    await prisma.paymentProof.create({ data: { ...base, reference: 'TRX-12345' } });
    await expect(
      prisma.paymentProof.create({ data: { ...base, reference: 'TRX-12345' } }),
    ).rejects.toThrow();
  });

  it('aprobar sin registrar revisor se rechaza', async () => {
    const ctx = await seedBillingContext();

    await expect(
      prisma.paymentProof.create({
        data: {
          eventId: ctx.event.id,
          registrationId: ctx.registration.id,
          channelId: ctx.channel.id,
          declaredAmount: '100.00',
          currency: 'USD',
          paidAt: new Date(),
          reference: 'TRX-1',
          status: 'APPROVED',
        },
      }),
    ).rejects.toThrow();
  });

  it('rechazar exige motivo', async () => {
    const ctx = await seedBillingContext();

    await expect(
      prisma.paymentProof.create({
        data: {
          eventId: ctx.event.id,
          registrationId: ctx.registration.id,
          channelId: ctx.channel.id,
          declaredAmount: '100.00',
          currency: 'USD',
          paidAt: new Date(),
          reference: 'TRX-2',
          status: 'REJECTED',
          reviewedAt: new Date(),
          reviewedBy: ctx.userId,
        },
      }),
    ).rejects.toThrow();
  });

  it('guarda la tasa congelada al cargar (DEC-009)', async () => {
    const ctx = await seedBillingContext();

    const proof = await prisma.paymentProof.create({
      data: {
        eventId: ctx.event.id,
        registrationId: ctx.registration.id,
        channelId: ctx.channel.id,
        declaredAmount: '696.00',
        currency: 'BOB',
        paidAt: new Date(),
        reference: 'TRX-3',
        exchangeRateMicros: BigInt(6_960_000),
      },
    });

    expect(proof.exchangeRateMicros).toBe(BigInt(6_960_000));
  });
});

describe('caja (CASH-001, CASH-002)', () => {
  it('un cobro en efectivo exige sesión de caja', async () => {
    const ctx = await seedBillingContext();

    await expect(
      prisma.payment.create({
        data: {
          eventId: ctx.event.id,
          amount: '100.00',
          currency: 'USD',
          method: 'CASH',
          approvedBy: ctx.userId,
        },
      }),
    ).rejects.toThrow();
  });

  it('con sesión abierta el cobro se acepta', async () => {
    const ctx = await seedBillingContext();
    const session = await prisma.cashSession.create({
      data: {
        eventId: ctx.event.id,
        cashAccountCode: 'CAJA-01',
        currency: 'USD',
        openedBy: ctx.userId,
      },
    });

    await expect(
      prisma.payment.create({
        data: {
          eventId: ctx.event.id,
          amount: '100.00',
          currency: 'USD',
          method: 'CASH',
          cashSessionId: session.id,
          approvedBy: ctx.userId,
        },
      }),
    ).resolves.toBeDefined();
  });

  it('cerrar con diferencia exige motivo', async () => {
    const ctx = await seedBillingContext();
    const session = await prisma.cashSession.create({
      data: {
        eventId: ctx.event.id,
        cashAccountCode: 'CAJA-01',
        currency: 'USD',
        openedBy: ctx.userId,
      },
    });

    await expect(
      prisma.cashSession.update({
        where: { id: session.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedBy: ctx.userId,
          expectedAmount: '500.00',
          countedAmount: '495.00',
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.cashSession.update({
        where: { id: session.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedBy: ctx.userId,
          expectedAmount: '500.00',
          countedAmount: '495.00',
          closeReason: 'Faltante detectado en el arqueo, reportado a Tesorería',
        },
      }),
    ).resolves.toBeDefined();
  });
});

describe('verificación pública sin PII (PAY-013, PAY-014, DEC-003)', () => {
  it('el token se guarda por hash y no se puede recuperar en claro', async () => {
    const ctx = await seedBillingContext();
    const token = randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(token).digest('hex');

    const payment = await prisma.payment.create({
      data: {
        eventId: ctx.event.id,
        amount: '100.00',
        currency: 'USD',
        method: 'BOLIVIA_QR_MANUAL',
        approvedBy: ctx.userId,
      },
    });

    await prisma.receipt.create({
      data: {
        eventId: ctx.event.id,
        paymentId: payment.id,
        sequence: 1,
        number: 'REC-ENC2026-000001',
        snapshot: {},
        verificationTokenHash: hash,
      },
    });

    // La base guarda el hash. El token en claro solo existe en el QR impreso.
    const stored = await prisma.receipt.findFirstOrThrow();
    expect(stored.verificationTokenHash).toBe(hash);
    expect(stored.verificationTokenHash).not.toBe(token);

    // Y se puede localizar por hash, que es como funciona la verificación.
    const found = await prisma.receipt.findUnique({ where: { verificationTokenHash: hash } });
    expect(found?.id).toBe(stored.id);
  });

  it('el snapshot del comprobante no incluye documento ni país (PAY-012)', async () => {
    const ctx = await seedBillingContext();
    const { receipt } = await issuePayment(ctx, '100.00');

    const claves = Object.keys(receipt.snapshot as Record<string, unknown>);
    expect(claves).not.toContain('documentNumber');
    expect(claves).not.toContain('country');
    // Sí incluye lo que PAY-012 autoriza.
    expect(claves).toContain('pilgrimName');
    expect(claves).toContain('registrationCode');
  });
});
