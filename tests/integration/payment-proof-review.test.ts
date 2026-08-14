import { reviewPaymentProof, takeProofForReview } from '@encuentro/application';
import { money, type Actor } from '@encuentro/domain';
import {
  createPaymentProofRepository,
  findAccountStatement,
  findProofDetail,
  verifyReceipt,
  type PrismaClient,
} from '@encuentro/infrastructure';
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
        // Sin conversión: la gestión de este escenario lleva los libros en la
        // misma moneda del canal, así que lo declarado ya es lo contabilizado.
        declared: money('420.00', USD),
        exchangeRateMicros: null,
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
        declared: money('420.00', USD),
        exchangeRateMicros: null,
        allocations: [{ chargeId: e.chargeId, amount: money('420.00', USD) }],
        credit: money('0.00', USD),
        actorId: REVISOR,
      }),
      repo.approve({
        proofId: segundaProof.id,
        expectedVersion: segundaProof.version,
        registrationId,
        amount: money('100.00', USD),
        declared: money('100.00', USD),
        exchangeRateMicros: null,
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

/**
 * Cobro en dólares con los libros en bolivianos — DEC-009.
 *
 * La forma real del cobro internacional: la cuenta de Estados Unidos recibe
 * dólares y los libros de la organización se llevan en bolivianos. Las
 * unitarias ya comprueban la conversión con dobles; aquí interesa lo único que
 * solo la base demuestra, que es **con qué moneda queda escrita la fila**.
 *
 * Es donde estaba el defecto: la aprobación entregaba el importe declarado sin
 * convertir, así que `payments.currency` acababa diciendo BOB sobre una cifra
 * en dólares. Cincuenta se quedaban en cincuenta y nadie lo veía hasta el
 * arqueo.
 */
describe('cobro en otra moneda — el pago entra en los libros convertido', () => {
  const BOB = 'BOB';

  interface EscenarioBOB extends Escenario {
    readonly registrationId: string;
    /** La persona sí tiene cuenta: sin ella no hay estado de cuenta que mirar. */
    readonly peregrinoUserId: string;
  }

  async function sembrarEnBolivianos(
    options: { tasaMicros?: bigint | null } = {},
  ): Promise<EscenarioBOB> {
    const event = await seedEvent(prisma, {
      code: `ENC-B${String(Math.floor(Math.random() * 100_000))}`,
      year: 2030 + Math.floor(Math.random() * 900),
      status: 'ACTIVE',
      currency: BOB,
    });

    await prisma.user.upsert({
      where: { id: REVISOR },
      update: {},
      create: { id: REVISOR, email: `revisor-${event.code}@encuentro.invalid`, displayName: 'R' },
    });

    const peregrino = await prisma.user.create({
      data: { email: `peregrino-${event.code}@encuentro.invalid`, displayName: 'Peregrino' },
    });
    const person = await prisma.person.create({
      data: {
        userId: peregrino.id,
        fullName: 'Peregrino Internacional',
        birthDate: new Date('1990-01-01'),
      },
    });
    const pkg = await prisma.package.create({
      data: { eventId: event.id, code: 'GENERAL', name: 'General', visibility: 'PUBLIC' },
    });
    const price = await prisma.priceVersion.create({
      data: { packageId: pkg.id, paymentMode: 'ARRIVAL', amount: '348.00', currency: BOB },
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
    // El cargo va en la moneda de los libros: es lo que la persona debe.
    const charge = await prisma.charge.create({
      data: {
        registrationId: registration.id,
        concept: 'PACKAGE',
        amount: '348.00',
        currency: BOB,
        snapshot: { packageCode: 'GENERAL' },
      },
    });
    // Y el canal cobra en dólares: es la cuenta de Estados Unidos.
    const channel = await prisma.paymentChannel.create({
      data: { eventId: event.id, code: 'US_ACCOUNT_MANUAL', currency: USD },
    });
    const proof = await prisma.paymentProof.create({
      data: {
        eventId: event.id,
        registrationId: registration.id,
        channelId: channel.id,
        declaredAmount: '50.00',
        currency: USD,
        paidAt: new Date(),
        reference: `REF-${event.code}`,
        status: 'SUBMITTED',
        // 6,96 BOB por dólar, congelada al cargar la evidencia.
        exchangeRateMicros: options.tasaMicros === undefined ? 6_960_000n : options.tasaMicros,
      },
    });

    return {
      eventId: event.id,
      eventCode: event.code,
      proofId: proof.id,
      chargeId: charge.id,
      proofVersion: proof.version,
      registrationId: registration.id,
      peregrinoUserId: peregrino.id,
    };
  }

  async function tomar(e: EscenarioBOB): Promise<number> {
    await takeProofForReview({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: e.proofVersion,
    });

    const tomada = await prisma.paymentProof.findUniqueOrThrow({
      where: { id: e.proofId },
      select: { version: true },
    });

    return tomada.version;
  }

  it('el pago queda en bolivianos, no en dólares con etiqueta de boliviano', async () => {
    const e = await sembrarEnBolivianos();
    const version = await tomar(e);

    await reviewPaymentProof({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: version,
      outcome: 'APPROVED',
      allocations: [{ chargeId: e.chargeId, amount: money('348.00', BOB) }],
    });

    const pago = await prisma.payment.findFirstOrThrow({ where: { sourceProofId: e.proofId } });

    // 50.00 USD × 6,96 = 348.00 BOB.
    expect(pago.amount.toString()).toBe('348');
    expect(pago.currency).toBe(BOB);

    const asignacion = await prisma.paymentAllocation.findFirstOrThrow({
      where: { paymentId: pago.id },
    });
    expect(asignacion.currency).toBe(BOB);

    // La evidencia conserva lo declarado: es lo que dice el extracto bancario.
    const evidencia = await prisma.paymentProof.findUniqueOrThrow({ where: { id: e.proofId } });
    expect(evidencia.declaredAmount.toString()).toBe('50');
    expect(evidencia.currency).toBe(USD);
  });

  /*
   * PAY-030: el comprobante es inmutable, así que lo que no se guarde al
   * emitirlo no se añade después. Las tres cifras van juntas o el número
   * convertido no se puede reconciliar contra nada.
   */
  it('el comprobante guarda las dos cifras y la tasa', async () => {
    const e = await sembrarEnBolivianos();
    const version = await tomar(e);

    await reviewPaymentProof({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: version,
      outcome: 'APPROVED',
      allocations: [{ chargeId: e.chargeId, amount: money('348.00', BOB) }],
    });

    const pago = await prisma.payment.findFirstOrThrow({ where: { sourceProofId: e.proofId } });
    const comprobante = await prisma.receipt.findUniqueOrThrow({ where: { paymentId: pago.id } });

    expect(comprobante.snapshot).toMatchObject({
      amount: '348.00',
      currency: BOB,
      declaredAmount: '50.00',
      declaredCurrency: USD,
      exchangeRateMicros: 6_960_000,
    });
  });

  /* REG-017: el saldo queda en cero con el importe convertido, así que confirma. */
  it('la conversión deja el saldo en cero y confirma la inscripción', async () => {
    const e = await sembrarEnBolivianos();
    const version = await tomar(e);

    await reviewPaymentProof({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: version,
      outcome: 'APPROVED',
      allocations: [{ chargeId: e.chargeId, amount: money('348.00', BOB) }],
    });

    const inscripcion = await prisma.registration.findUniqueOrThrow({
      where: { id: e.registrationId },
    });
    expect(inscripcion.status).toBe('CONFIRMED');
  });

  /*
   * Una evidencia multimoneda sin tasa congelada existe: son las cargadas antes
   * de que hubiera registro diario. No es aprobable, y no deja nada escrito.
   */
  it('sin tasa congelada no aprueba ni escribe nada', async () => {
    const e = await sembrarEnBolivianos({ tasaMicros: null });
    const version = await tomar(e);

    await expect(
      reviewPaymentProof({ proofs: repo }, actor(e.eventId), {
        eventId: e.eventId,
        proofId: e.proofId,
        expectedVersion: version,
        outcome: 'APPROVED',
        allocations: [{ chargeId: e.chargeId, amount: money('348.00', BOB) }],
      }),
    ).rejects.toMatchObject({ code: 'EXCHANGE_RATE_MISSING' });

    expect(await prisma.payment.count({ where: { sourceProofId: e.proofId } })).toBe(0);
    expect(await prisma.receipt.count({ where: { eventId: e.eventId } })).toBe(0);

    // Y la evidencia sigue en revisión, no en un estado del que no se salga.
    const evidencia = await prisma.paymentProof.findUniqueOrThrow({ where: { id: e.proofId } });
    expect(evidencia.status).toBe('UNDER_REVIEW');
  });

  /*
   * El estado de cuenta del peregrino: sus cargos están en bolivianos y su pago
   * también. Es la pantalla donde el defecto se veía —cincuenta dólares
   * presentados como cincuenta bolivianos— y la que decide si cree que ya pagó.
   */
  it('el estado de cuenta cuadra en la moneda de los libros', async () => {
    const e = await sembrarEnBolivianos();
    const version = await tomar(e);

    await reviewPaymentProof({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: version,
      outcome: 'APPROVED',
      allocations: [{ chargeId: e.chargeId, amount: money('348.00', BOB) }],
    });

    const cuenta = await findAccountStatement(prisma, e.eventId, e.peregrinoUserId);

    expect(cuenta?.currency).toBe(BOB);
    expect(cuenta?.charged).toBe('348.00');
    expect(cuenta?.allocated).toBe('348.00');
    expect(cuenta?.outstanding).toBe('0.00');
    expect(cuenta?.balanceState).toBe('PAID');
    // Sin saldo a favor: lo convertido cubre el cargo exactamente.
    expect(cuenta?.credit).toBe('0.00');

    // El pago se presenta en bolivianos y la evidencia conserva su dólar, con
    // la equivalencia al lado para que el peregrino pueda cotejar las dos.
    expect(cuenta?.payments[0]?.amount).toBe('348.00');
    expect(cuenta?.proofs[0]?.declaredAmount).toBe('50.00');
    expect(cuenta?.proofs[0]?.currency).toBe(USD);
    expect(cuenta?.proofs[0]?.bookedAmount).toBe('348.00');
  });

  it('el detalle de revisión trae las dos cifras', async () => {
    const e = await sembrarEnBolivianos();

    const detalle = await findProofDetail(prisma, e.proofId);

    expect(detalle?.declaredAmount).toBe('50.00');
    expect(detalle?.currency).toBe(USD);
    expect(detalle?.bookedAmount).toBe('348.00');
    expect(detalle?.bookCurrency).toBe(BOB);
    expect(detalle?.bookingObstacle).toBeNull();
    expect(detalle?.exchangeRateMicros).toBe(6_960_000);
  });

  it('el detalle dice que falta la tasa en vez de reventar', async () => {
    const e = await sembrarEnBolivianos({ tasaMicros: null });

    const detalle = await findProofDetail(prisma, e.proofId);

    expect(detalle?.bookedAmount).toBeNull();
    expect(detalle?.bookingObstacle).toBe('RATE_MISSING');
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

/**
 * El bucle de verificación pública — PAY-031, PAY-033, DEC-003.
 *
 * Estaba roto por los dos extremos: `approve` generaba el token en claro y lo
 * descartaba al terminar la función, y `verifyReceiptToken` era un stub que
 * devolvía siempre `unavailable`. Cada comprobante emitido nacía inverificable y
 * no era recuperable, porque la base solo guarda el HMAC.
 *
 * Estas pruebas recorren el bucle entero: emitir, recibir el token en claro y
 * verificarlo contra la base.
 */
describe('verificación pública del comprobante', () => {
  async function emitir(e: Escenario) {
    await takeProofForReview({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: e.proofVersion,
    });

    return await reviewPaymentProof({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: e.proofVersion + 1,
      outcome: 'APPROVED',
      allocations: [{ chargeId: e.chargeId, amount: money('420.00', USD) }],
    });
  }

  it('la aprobación devuelve el comprobante con su token en claro', async () => {
    const e = await sembrar();
    const emitido = await emitir(e);

    expect(emitido).not.toBeNull();
    expect(emitido?.number).toBe(`REC-${e.eventCode}-000001`);
    // 32 bytes en base64url. Sin esto el QR no puede imprimirse nunca.
    expect(emitido?.verificationToken).toHaveLength(43);
  });

  it('el token en claro no llega a la base: solo su HMAC', async () => {
    const e = await sembrar();
    const emitido = await emitir(e);

    const fila = await prisma.receipt.findFirstOrThrow({ where: { eventId: e.eventId } });

    expect(fila.verificationTokenHash).not.toBe(emitido?.verificationToken);
    expect(JSON.stringify(fila)).not.toContain(emitido?.verificationToken ?? '<sin token>');
  });

  it('ese token verifica el comprobante y devuelve solo lo público', async () => {
    const e = await sembrar();
    const emitido = await emitir(e);

    const resultado = await verifyReceipt(
      prisma,
      emitido?.verificationToken ?? '',
      SECRETO.verificationSecret,
    );

    expect(resultado.kind).toBe('found');

    if (resultado.kind === 'found') {
      expect(resultado.receipt.number).toBe(`REC-${e.eventCode}-000001`);
      expect(resultado.receipt.eventCode).toBe(e.eventCode);
      expect(resultado.receipt.amount).toBe('420.00');
      expect(resultado.receipt.currency).toBe(USD);
      expect(resultado.receipt.status).toBe('VALID');

      // NFR-013: la zona viaja con la fecha para que la página pública muestre
      // el día civil de la gestión y no el sello UTC.
      expect(resultado.receipt.timezone).toBe('America/La_Paz');

      /*
       * `data-api-rbac.md` §7: la respuesta pública no lleva nombre, código de
       * inscripción, referencia, archivo bancario ni aprobador.
       */
      expect(Object.keys(resultado.receipt).sort()).toEqual([
        'amount',
        'currency',
        'eventCode',
        'issuedAt',
        'number',
        'status',
        'timezone',
      ]);
    }
  });

  it('un token inventado no encuentra nada', async () => {
    const e = await sembrar();
    await emitir(e);

    for (const candidato of ['', 'x', 'a'.repeat(43), 'a'.repeat(500)]) {
      const resultado = await verifyReceipt(prisma, candidato, SECRETO.verificationSecret);
      expect(resultado.kind).toBe('not-found');
    }
  });

  /*
   * El HMAC necesita la clave, que vive en el entorno y no en la base. Un
   * volcado de `receipts` no basta para fabricar un token válido.
   */
  it('con otra clave el mismo token no verifica', async () => {
    const e = await sembrar();
    const emitido = await emitir(e);

    const resultado = await verifyReceipt(
      prisma,
      emitido?.verificationToken ?? '',
      'otra-clave-distinta-de-la-que-emitio-el-token',
    );

    expect(resultado.kind).toBe('not-found');
  });

  it('un comprobante anulado se declara anulado, no inexistente (PAY-033)', async () => {
    const e = await sembrar();
    const emitido = await emitir(e);

    /*
     * `receipts_void_is_complete` exige los tres campos: sin `voided_by` no hay
     * anulación válida, porque PAY-033 pide saber quién la autorizó.
     */
    await prisma.receipt.updateMany({
      where: { eventId: e.eventId },
      data: { voidedAt: new Date(), voidedBy: REVISOR, voidReason: 'Corrección de importe' },
    });

    const resultado = await verifyReceipt(
      prisma,
      emitido?.verificationToken ?? '',
      SECRETO.verificationSecret,
    );

    expect(resultado.kind).toBe('found');
    if (resultado.kind === 'found') expect(resultado.receipt.status).toBe('VOID');
  });
});

/**
 * Rastro de auditoría de la revisión — GOV-005, AUD-001.
 *
 * Las tres escrituras de este módulo dejaban `event_id` sin poner. La columna
 * admite nulo porque hay acciones globales, así que nada fallaba — pero la
 * pantalla de auditoría filtra por gestión, y quién autorizó cada cobro **no
 * aparecía en ninguna parte**.
 */
describe('auditoría de la revisión', () => {
  it('las tres acciones quedan atadas a su gestión', async () => {
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
      outcome: 'APPROVED',
      allocations: [{ chargeId: e.chargeId, amount: money('420.00', USD) }],
    });

    const rastro = await prisma.auditLog.findMany({
      where: { entity: 'payment_proof', entityId: e.proofId },
      select: { action: true, eventId: true },
    });

    expect(rastro.map((r) => r.action).sort()).toEqual([
      'payment.proof.approve',
      'payment.proof.take_for_review',
    ]);

    // Lo que fallaba: ninguna con eventId nulo.
    for (const fila of rastro) expect(fila.eventId).toBe(e.eventId);
  });

  it('el rechazo también queda atado a su gestión', async () => {
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

    const revision = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: e.proofId, action: 'payment.proof.review' },
    });

    expect(revision.eventId).toBe(e.eventId);
  });

  /*
   * La propiedad que importa de verdad: que la pantalla lo encuentre. Filtra
   * `where: { eventId }`, así que un rastro con nulo es un rastro invisible.
   */
  it('la consulta de la pantalla de auditoría los encuentra', async () => {
    const e = await sembrar();

    await takeProofForReview({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: e.proofVersion,
    });

    const visibles = await prisma.auditLog.findMany({
      where: { eventId: e.eventId },
      select: { action: true },
    });

    expect(visibles.map((v) => v.action)).toContain('payment.proof.take_for_review');
  });
});

/**
 * La carrera de aprobación — PAY-020.
 *
 * El caso de uso valida el reparto contra un saldo leído **fuera** de la
 * transacción. Con dos evidencias en revisión sobre la misma inscripción —el
 * peregrino que transfiere dos veces por error— dos revisores leen «pendiente
 * 420.00», los dos asignan 420.00, y el cargo acababa con 840 aplicados sobre
 * 420 debidos: saldo negativo, sobrepago que nadie hizo y saldo a favor perdido.
 *
 * El cerrojo de gestión ya serializaba las aprobaciones; lo que faltaba era
 * volver a mirar el saldo dentro de la transacción.
 */
describe('dos evidencias sobre el mismo cargo', () => {
  async function segundaEvidencia(e: Escenario) {
    const proof = await prisma.paymentProof.findUniqueOrThrow({ where: { id: e.proofId } });

    return await prisma.paymentProof.create({
      data: {
        eventId: proof.eventId,
        registrationId: proof.registrationId,
        channelId: proof.channelId,
        declaredAmount: '420.00',
        currency: USD,
        paidAt: new Date(),
        reference: `${proof.reference}-BIS`,
        status: 'SUBMITTED',
      },
    });
  }

  async function aprobarEntera(e: Escenario, proofId: string) {
    const v0 = await prisma.paymentProof.findUniqueOrThrow({ where: { id: proofId } });

    await takeProofForReview({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId,
      expectedVersion: v0.version,
    });

    return await reviewPaymentProof({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId,
      expectedVersion: v0.version + 1,
      outcome: 'APPROVED',
      allocations: [{ chargeId: e.chargeId, amount: money('420.00', USD) }],
    });
  }

  it('la segunda no puede volver a asignar el cargo ya saldado', async () => {
    const e = await sembrar();
    const segunda = await segundaEvidencia(e);

    await aprobarEntera(e, e.proofId);

    await expect(aprobarEntera(e, segunda.id)).rejects.toMatchObject({
      code: 'PAYMENT_OVER_ALLOCATED',
    });

    // Y el rechazo revierte la transacción entera: ni pago, ni comprobante.
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.receipt.count()).toBe(1);
    expect(await prisma.paymentAllocation.count()).toBe(1);
  });

  it('el cargo no queda sobreasignado ni con saldo negativo', async () => {
    const e = await sembrar();
    const segunda = await segundaEvidencia(e);

    await aprobarEntera(e, e.proofId);
    await aprobarEntera(e, segunda.id).catch(() => undefined);

    const asignado = await prisma.paymentAllocation.aggregate({
      where: { chargeId: e.chargeId },
      _sum: { amount: true },
    });

    expect(asignado._sum.amount?.toString()).toBe('420');
  });

  /*
   * Lo que sí debe poder hacerse: repartir la segunda evidencia contra lo que
   * quede. Aquí no queda nada, así que se aprueba sin reparto y los 420 enteros
   * pasan a saldo a favor (DEC-008).
   */
  it('la segunda puede aprobarse sin reparto y queda como saldo a favor', async () => {
    const e = await sembrar();
    const segunda = await segundaEvidencia(e);

    await aprobarEntera(e, e.proofId);

    const v0 = await prisma.paymentProof.findUniqueOrThrow({ where: { id: segunda.id } });
    await takeProofForReview({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: segunda.id,
      expectedVersion: v0.version,
    });

    const emitido = await reviewPaymentProof({ proofs: repo }, actor(e.eventId), {
      eventId: e.eventId,
      proofId: segunda.id,
      expectedVersion: v0.version + 1,
      outcome: 'APPROVED',
      allocations: [],
    });

    expect(emitido).not.toBeNull();

    const pago = await prisma.payment.findFirstOrThrow({ where: { sourceProofId: segunda.id } });
    const comprobante = await prisma.receipt.findUniqueOrThrow({ where: { paymentId: pago.id } });

    expect(comprobante.snapshot).toMatchObject({ credit: '420.00' });
  });
});
