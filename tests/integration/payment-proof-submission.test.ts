import {
  resubmitPaymentProof,
  reviewPaymentProof,
  submitPaymentProof,
  takeProofForReview,
  type EvidenceStore,
} from '@encuentro/application';
import { money, type Actor } from '@encuentro/domain';
import {
  createPaymentProofRepository,
  createProofSubmissionRepository,
  findAccountStatement,
  listAdvanceChannels,
  systemClock,
  type PrismaClient,
} from '@encuentro/infrastructure';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, seedEvent, testPrisma } from './helpers';

/**
 * Gate del circuito de carga de evidencias — PAY-018, PAY-021, PAY-025, PAY-027.
 *
 * Las unitarias ya comprueban las reglas con dobles. Aquí se verifica lo único
 * que solo la base puede demostrar: que el índice único resuelve la carrera de
 * referencias duplicadas, que el compare-and-swap de la corrección deja pasar a
 * uno solo, y que el estado de cuenta que ve el peregrino coincide con lo que
 * escribió el revisor.
 */
const prisma: PrismaClient = testPrisma();
const USD = 'USD';
const SECRETO = { verificationSecret: 'secreto-de-prueba-para-el-hmac-32chars' };

const proofs = createProofSubmissionRepository(prisma);
const revision = createPaymentProofRepository(prisma, SECRETO);

/**
 * Almacén de mentira.
 *
 * El almacén real ya tiene su propio gate (`object-storage.test.ts`). Aquí
 * interesa la base, y depender de MinIO haría fallar estas pruebas por un
 * motivo que no es el suyo.
 */
const evidence: EvidenceStore = {
  store: () =>
    Promise.resolve({ fileId: `evidencias/x/${crypto.randomUUID()}`, checksum: 'a'.repeat(64) }),
};

const deps = { proofs, evidence, clock: systemClock };

const ARCHIVO = { body: new Uint8Array([1, 2, 3, 4]), contentType: 'image/png' } as const;

interface Escenario {
  readonly eventId: string;
  readonly eventCode: string;
  readonly registrationId: string;
  readonly chargeId: string;
  readonly channelId: string;
  readonly peregrino: Actor;
  readonly revisor: Actor;
}

function peregrinoActor(userId: string): Actor {
  // Sin asignaciones: le autoriza la titularidad, no un permiso (PAY-021).
  return { userId, assignments: [] };
}

/**
 * Predicado de tipo para quedarse con lo rechazado de un `allSettled`.
 *
 * Un `filter` normal no estrecha el tipo, y sin esto cada prueba de carrera
 * necesitaría un `as` para leer `.reason`.
 */
function rechazada(resultado: PromiseSettledResult<unknown>): resultado is PromiseRejectedResult {
  return resultado.status === 'rejected';
}

async function sembrar(options: { eventStatus?: string } = {}): Promise<Escenario> {
  const event = await seedEvent(prisma, {
    code: `ENC-S${String(Math.floor(Math.random() * 100_000))}`,
    year: 2030 + Math.floor(Math.random() * 900),
    status: options.eventStatus ?? 'ACTIVE',
  });

  const user = await prisma.user.create({
    data: { email: `peregrino-${event.code}@encuentro.invalid`, displayName: 'Peregrino' },
  });

  const revisor = await prisma.user.create({
    data: { email: `revisor-${event.code}@encuentro.invalid`, displayName: 'Revisor' },
  });

  const person = await prisma.person.create({
    data: { userId: user.id, fullName: 'Peregrino Prueba', birthDate: new Date('1990-01-01') },
  });

  const pkg = await prisma.package.create({
    data: { eventId: event.id, code: 'GENERAL', name: 'General', visibility: 'PUBLIC' },
  });

  /*
   * `ADVANCE` exige vigencia y mínimo de pago: el constraint
   * `price_versions_advance_is_complete` lo impone porque sin ellos el dominio
   * no puede decidir si conserva tarifa (REG-021) ni si desbloquea hotel
   * (REG-020). Es la modalidad correcta para esta prueba —el peregrino declara
   * un pago anticipado— así que se completa en vez de rebajarla a `ARRIVAL`.
   */
  const price = await prisma.priceVersion.create({
    data: {
      packageId: pkg.id,
      paymentMode: 'ADVANCE',
      amount: '420.00',
      currency: USD,
      startsAt: new Date('2026-07-01T00:00:00Z'),
      endsAt: new Date('2026-10-15T23:59:59Z'),
      minPaymentPercent: 50,
    },
  });

  const registration = await prisma.registration.create({
    data: {
      eventId: event.id,
      code: `REG-${event.code}`,
      personId: person.id,
      packageId: pkg.id,
      priceVersionId: price.id,
      paymentMode: 'ADVANCE',
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

  return {
    eventId: event.id,
    eventCode: event.code,
    registrationId: registration.id,
    chargeId: charge.id,
    channelId: channel.id,
    peregrino: peregrinoActor(user.id),
    revisor: {
      userId: revisor.id,
      assignments: [
        { permissions: ['payment.proof.review'], scope: { type: 'EVENT', eventId: event.id } },
      ],
    },
  };
}

function declaracion(e: Escenario, overrides: { reference?: string; amount?: string } = {}) {
  return {
    eventId: e.eventId,
    registrationId: e.registrationId,
    channelId: e.channelId,
    amount: money(overrides.amount ?? '420.00', USD),
    paidAt: new Date('2026-08-01T10:00:00Z'),
    reference: overrides.reference ?? `TRF-${e.eventCode}`,
    upload: ARCHIVO,
  };
}

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('carga de evidencia', () => {
  it('deja la evidencia esperando revisión, sin crear ningún pago (PAY-025)', async () => {
    const e = await sembrar();

    const proofId = await submitPaymentProof(deps, e.peregrino, declaracion(e));

    const proof = await prisma.paymentProof.findUniqueOrThrow({ where: { id: proofId } });
    expect(proof.status).toBe('SUBMITTED');
    expect(proof.fileChecksum).toHaveLength(64);
    // `Decimal.toString()` quita los ceros finales: se compara el valor, no su
    // representación. El formato de pantalla lo fija `decimalText` y se
    // comprueba en el bloque del estado de cuenta.
    expect(Number(proof.declaredAmount)).toBe(420);

    // Lo que **no** debe haber ocurrido: nada de dinero.
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.paymentAllocation.count()).toBe(0);
    expect(await prisma.receipt.count()).toBe(0);
  });

  it('deja rastro en auditoría sin el nombre del pagador (regla 03-security-rbac)', async () => {
    const e = await sembrar();

    const proofId = await submitPaymentProof(deps, e.peregrino, {
      ...declaracion(e),
      payerName: 'Ana Pérez',
    });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { entity: 'payment_proof', entityId: proofId },
    });

    expect(log.action).toBe('payment.proof.submit');
    expect(log.eventId).toBe(e.eventId);
    expect(JSON.stringify(log.afterRedacted)).not.toContain('Ana Pérez');
  });

  /*
   * PAY-027 bajo concurrencia. El índice `(event_id, reference)` es quien
   * decide: comprobar antes y escribir después dejaría una ventana en la que
   * dos envíos simultáneos pasan los dos.
   */
  it('dos cargas simultáneas con la misma referencia dejan una sola', async () => {
    const e = await sembrar();
    const misma = declaracion(e, { reference: 'TRF-CARRERA' });

    const resultados = await Promise.allSettled([
      submitPaymentProof(deps, e.peregrino, misma),
      submitPaymentProof(deps, e.peregrino, misma),
    ]);

    const aceptadas = resultados.filter((r) => r.status === 'fulfilled');
    const rechazadas = resultados.filter(rechazada);

    expect(aceptadas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0]?.reason).toMatchObject({
      code: 'PAYMENT_PROOF_DUPLICATE_REFERENCE',
    });
    expect(await prisma.paymentProof.count()).toBe(1);
  });

  it('la referencia repetida se rechaza también en secuencia', async () => {
    const e = await sembrar();

    await submitPaymentProof(deps, e.peregrino, declaracion(e, { reference: 'TRF-1' }));

    await expect(
      submitPaymentProof(deps, e.peregrino, declaracion(e, { reference: 'TRF-1' })),
    ).rejects.toMatchObject({ code: 'PAYMENT_PROOF_DUPLICATE_REFERENCE' });
  });

  it('otra persona no puede cargar contra una inscripción ajena (PAY-021)', async () => {
    const e = await sembrar();
    const intruso = await prisma.user.create({
      data: { email: `intruso-${e.eventCode}@encuentro.invalid`, displayName: 'Intruso' },
    });

    await expect(
      submitPaymentProof(deps, peregrinoActor(intruso.id), declaracion(e)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(await prisma.paymentProof.count()).toBe(0);
  });

  it('una gestión cerrada no admite evidencias (GOV-004)', async () => {
    const e = await sembrar({ eventStatus: 'OPERATIONALLY_CLOSED' });

    await expect(submitPaymentProof(deps, e.peregrino, declaracion(e))).rejects.toMatchObject({
      code: 'EVENT_OPERATIONS_BLOCKED',
    });
  });

  /*
   * PAY-024 y PAY-011, con el canal de caja realmente existiendo en la base.
   *
   * La pantalla solo ofrece los tres anticipados, pero el identificador del
   * canal viaja en el formulario y la acción de servidor es invocable
   * directamente. Si esto pasara, el pago resultante nunca aparecería en ningún
   * arqueo y aun así bajaría el saldo del peregrino.
   */
  it('no se puede declarar por autoservicio contra un canal de caja', async () => {
    const e = await sembrar();

    const caja = await prisma.paymentChannel.create({
      data: { eventId: e.eventId, code: 'CASH', currency: USD },
    });

    await expect(
      submitPaymentProof(deps, e.peregrino, { ...declaracion(e), channelId: caja.id }),
    ).rejects.toMatchObject({ code: 'PAYMENT_PROOF_NOT_SUBMITTABLE' });

    expect(await prisma.paymentProof.count()).toBe(0);
  });
});

describe('corrección de una evidencia devuelta — PAY-026', () => {
  async function pedirCorreccion(e: Escenario, proofId: string): Promise<number> {
    const v0 = await prisma.paymentProof.findUniqueOrThrow({
      where: { id: proofId },
      select: { version: true },
    });

    await takeProofForReview({ proofs: revision }, e.revisor, {
      eventId: e.eventId,
      proofId,
      expectedVersion: v0.version,
    });

    const v1 = await prisma.paymentProof.findUniqueOrThrow({
      where: { id: proofId },
      select: { version: true },
    });

    await reviewPaymentProof({ proofs: revision }, e.revisor, {
      eventId: e.eventId,
      proofId,
      expectedVersion: v1.version,
      outcome: 'CORRECTION_REQUESTED',
      reason: 'La imagen está cortada y no se lee la referencia.',
    });

    const v2 = await prisma.paymentProof.findUniqueOrThrow({
      where: { id: proofId },
      select: { version: true },
    });

    return v2.version;
  }

  it('cierra el circuito: pedir corrección y corregir sobre la misma fila', async () => {
    const e = await sembrar();
    const proofId = await submitPaymentProof(deps, e.peregrino, declaracion(e));
    const version = await pedirCorreccion(e, proofId);

    await resubmitPaymentProof(deps, e.peregrino, {
      eventId: e.eventId,
      proofId,
      expectedVersion: version,
      amount: money('420.00', USD),
      paidAt: new Date('2026-08-02T10:00:00Z'),
      reference: 'TRF-CORREGIDA',
      upload: ARCHIVO,
    });

    const proof = await prisma.paymentProof.findUniqueOrThrow({ where: { id: proofId } });

    expect(proof.status).toBe('SUBMITTED');
    expect(proof.reference).toBe('TRF-CORREGIDA');
    // El motivo se limpia: ya no está pendiente de atender.
    expect(proof.reviewReason).toBeNull();
    expect(proof.reviewedBy).toBeNull();
    // Una sola fila: corregir no duplica la evidencia.
    expect(await prisma.paymentProof.count()).toBe(1);
  });

  it('el motivo del rechazo sobrevive en auditoría (GOV-009)', async () => {
    const e = await sembrar();
    const proofId = await submitPaymentProof(deps, e.peregrino, declaracion(e));
    const version = await pedirCorreccion(e, proofId);

    await resubmitPaymentProof(deps, e.peregrino, {
      eventId: e.eventId,
      proofId,
      expectedVersion: version,
      amount: money('420.00', USD),
      paidAt: new Date('2026-08-02T10:00:00Z'),
      reference: 'TRF-CORREGIDA-2',
      upload: ARCHIVO,
    });

    const motivos = await prisma.auditLog.findMany({
      where: { entityId: proofId, action: 'payment.proof.review' },
      select: { reason: true },
    });

    expect(motivos.map((m) => m.reason)).toContain(
      'La imagen está cortada y no se lee la referencia.',
    );
  });

  it('dos correcciones simultáneas: solo una se aplica', async () => {
    const e = await sembrar();
    const proofId = await submitPaymentProof(deps, e.peregrino, declaracion(e));
    const version = await pedirCorreccion(e, proofId);

    const correccion = (reference: string) => ({
      eventId: e.eventId,
      proofId,
      expectedVersion: version,
      amount: money('420.00', USD),
      paidAt: new Date('2026-08-02T10:00:00Z'),
      reference,
      upload: ARCHIVO,
    });

    const resultados = await Promise.allSettled([
      resubmitPaymentProof(deps, e.peregrino, correccion('TRF-A')),
      resubmitPaymentProof(deps, e.peregrino, correccion('TRF-B')),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.find(rechazada)?.reason).toMatchObject({ code: 'EVENT_VERSION_CONFLICT' });
  });
});

describe('estado de cuenta — PAY-002, REG-017, DEC-008', () => {
  async function aprobar(e: Escenario, proofId: string, reparto: string): Promise<void> {
    const v0 = await prisma.paymentProof.findUniqueOrThrow({
      where: { id: proofId },
      select: { version: true },
    });

    await takeProofForReview({ proofs: revision }, e.revisor, {
      eventId: e.eventId,
      proofId,
      expectedVersion: v0.version,
    });

    const v1 = await prisma.paymentProof.findUniqueOrThrow({
      where: { id: proofId },
      select: { version: true },
    });

    await reviewPaymentProof({ proofs: revision }, e.revisor, {
      eventId: e.eventId,
      proofId,
      expectedVersion: v1.version,
      outcome: 'APPROVED',
      allocations: [{ chargeId: e.chargeId, amount: money(reparto, USD) }],
    });
  }

  it('sin pagos aprobados, el saldo es el cargo entero', async () => {
    const e = await sembrar();
    await submitPaymentProof(deps, e.peregrino, declaracion(e));

    const cuenta = await findAccountStatement(prisma, e.eventId, e.peregrino.userId);

    expect(cuenta).not.toBeNull();
    expect(cuenta?.charged).toBe('420.00');
    expect(cuenta?.allocated).toBe('0.00');
    expect(cuenta?.outstanding).toBe('420.00');
    expect(cuenta?.balanceState).toBe('UNPAID');
    expect(cuenta?.proofs).toHaveLength(1);
    expect(cuenta?.payments).toHaveLength(0);
    // REG-017: con saldo pendiente, la inscripción no se confirma.
    expect(cuenta?.confirmation).toEqual({
      outcome: 'STAY_SUBMITTED',
      reason: 'OUTSTANDING_BALANCE',
    });
  });

  it('un pago parcial deja PARTIAL y la inscripción sin confirmar (REG-017)', async () => {
    const e = await sembrar();
    const proofId = await submitPaymentProof(
      deps,
      e.peregrino,
      declaracion(e, { amount: '210.00' }),
    );
    await aprobar(e, proofId, '210.00');

    const cuenta = await findAccountStatement(prisma, e.eventId, e.peregrino.userId);

    expect(cuenta?.allocated).toBe('210.00');
    expect(cuenta?.outstanding).toBe('210.00');
    expect(cuenta?.balanceState).toBe('PARTIAL');
    expect(cuenta?.credit).toBe('0.00');
    expect(cuenta?.confirmation?.outcome).toBe('STAY_SUBMITTED');
    expect(cuenta?.payments[0]?.receiptNumber).toMatch(/^REC-.+-000001$/);

    /*
     * Importes siempre con dos decimales. `Decimal.toString()` devolvería «210»
     * y la columna de la pantalla dejaría de alinearse con «210.50».
     */
    expect(cuenta?.payments[0]?.amount).toBe('210.00');
    expect(cuenta?.proofs[0]?.declaredAmount).toBe('210.00');
  });

  /*
   * REG-017 de punta a punta. Desde que la aprobación confirma en su misma
   * transacción, pagar del todo no deja la inscripción «lista para confirmar»:
   * la deja confirmada. El veredicto pasa a ser nulo porque la pregunta ya no
   * tiene sentido.
   */
  it('pagado en total, la inscripción queda confirmada', async () => {
    const e = await sembrar();
    const proofId = await submitPaymentProof(deps, e.peregrino, declaracion(e));
    await aprobar(e, proofId, '420.00');

    const cuenta = await findAccountStatement(prisma, e.eventId, e.peregrino.userId);

    expect(cuenta?.outstanding).toBe('0.00');
    expect(cuenta?.balanceState).toBe('PAID');
    expect(cuenta?.registrationStatus).toBe('CONFIRMED');
    expect(cuenta?.confirmation).toBeNull();
  });

  /*
   * DEC-008. El excedente no baja del saldo pendiente —PAY-020 impide asignar
   * a un cargo más de lo que debe—, así que aparece como saldo a favor: la
   * parte cobrada que no se repartió.
   */
  it('el sobrepago queda como saldo a favor, no como devolución', async () => {
    const e = await sembrar();
    const proofId = await submitPaymentProof(
      deps,
      e.peregrino,
      declaracion(e, { amount: '500.00' }),
    );
    await aprobar(e, proofId, '420.00');

    const cuenta = await findAccountStatement(prisma, e.eventId, e.peregrino.userId);

    expect(cuenta?.outstanding).toBe('0.00');
    expect(cuenta?.credit).toBe('80.00');
  });

  /*
   * La propiedad que separa una pantalla de autoservicio de un IDOR: la cuenta
   * se busca por el usuario de la sesión, no por un identificador de la URL.
   */
  it('otra persona no ve este estado de cuenta', async () => {
    const e = await sembrar();
    const otro = await prisma.user.create({
      data: { email: `otro-${e.eventCode}@encuentro.invalid`, displayName: 'Otro' },
    });

    expect(await findAccountStatement(prisma, e.eventId, otro.id)).toBeNull();
  });

  it('sin inscripción en la gestión no hay estado de cuenta', async () => {
    const e = await sembrar();
    const otra = await seedEvent(prisma, {
      code: `ENC-Z${String(Date.now() % 100000)}`,
      year: 2999,
    });

    expect(await findAccountStatement(prisma, otra.id, e.peregrino.userId)).toBeNull();
  });
});

describe('canales ofrecidos al peregrino — PAY-023, PAY-024', () => {
  it('ofrece los anticipados activos y nunca los de caja', async () => {
    const e = await sembrar();

    await prisma.paymentChannel.create({
      data: { eventId: e.eventId, code: 'CASH', currency: USD },
    });
    await prisma.paymentChannel.create({
      data: { eventId: e.eventId, code: 'BOLIVIA_QR_MANUAL', currency: USD, active: false },
    });

    const canales = await listAdvanceChannels(prisma, e.eventId, [
      'BOLIVIA_QR_MANUAL',
      'US_ACCOUNT_MANUAL',
      'US_PAYMENT_LINK_MANUAL',
    ]);

    expect(canales.map((c) => c.code)).toEqual(['US_ACCOUNT_MANUAL']);
  });

  it('no ofrece los canales de otra gestión', async () => {
    const e = await sembrar();
    const otra = await seedEvent(prisma, {
      code: `ENC-Y${String(Date.now() % 100000)}`,
      year: 2998,
    });

    await prisma.paymentChannel.create({
      data: { eventId: otra.id, code: 'US_PAYMENT_LINK_MANUAL', currency: USD },
    });

    const canales = await listAdvanceChannels(prisma, e.eventId, [
      'BOLIVIA_QR_MANUAL',
      'US_ACCOUNT_MANUAL',
      'US_PAYMENT_LINK_MANUAL',
    ]);

    expect(canales.map((c) => c.code)).toEqual(['US_ACCOUNT_MANUAL']);
  });
});
