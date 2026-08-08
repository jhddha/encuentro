import {
  confirmRegistration,
  inspectConfirmation,
  reviewPaymentProof,
  takeProofForReview,
} from '@encuentro/application';
import { money, type Actor } from '@encuentro/domain';
import {
  createPaymentProofRepository,
  createRegistrationConfirmationRepository,
  listRegistrationsWithBalance,
  type PrismaClient,
} from '@encuentro/infrastructure';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, seedEvent, testPrisma } from './helpers';

/**
 * Gate de la confirmación de inscripciones — REG-017.
 *
 * Hay **dos caminos** hacia `CONFIRMED` y lo que solo la base puede demostrar es
 * cómo conviven: que el derivado ocurre dentro de la transacción que aprueba el
 * pago, que el manual pierde la carrera limpiamente cuando el derivado se
 * adelantó, y que una inscripción cancelada o ya confirmada **no revienta un
 * cobro legítimo**.
 */
const prisma: PrismaClient = testPrisma();
const USD = 'USD';
const SECRETO = { verificationSecret: 'secreto-de-prueba-para-el-hmac-32chars' };

const revision = createPaymentProofRepository(prisma, SECRETO);
const confirmacion = createRegistrationConfirmationRepository(prisma);

interface Escenario {
  readonly eventId: string;
  readonly eventCode: string;
  readonly registrationId: string;
  readonly chargeId: string;
  readonly proofId: string;
  readonly revisor: Actor;
  readonly inscripciones: Actor;
}

/**
 * `sinCargo` deja la inscripción con saldo cero desde el principio.
 *
 * No se puede llegar ahí borrando el cargo: un trigger lo impide («charges es
 * inmutable: DELETE no está permitido», GOV-005). Es el escenario que necesita
 * el camino manual para probarse sin que el derivado se le adelante.
 */
async function sembrar(options: { importe?: string; sinCargo?: boolean } = {}): Promise<Escenario> {
  const event = await seedEvent(prisma, {
    code: `ENC-C${String(Math.floor(Math.random() * 100_000))}`,
    year: 2030 + Math.floor(Math.random() * 900),
    status: 'ACTIVE',
  });

  const revisor = await prisma.user.create({
    data: { email: `revisor-${event.code}@encuentro.invalid`, displayName: 'Revisor' },
  });

  const gestor = await prisma.user.create({
    data: { email: `inscrip-${event.code}@encuentro.invalid`, displayName: 'Inscripciones' },
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

  const charge =
    options.sinCargo === true
      ? { id: '' }
      : await prisma.charge.create({
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
      reference: `REF-${event.code}`,
      status: 'SUBMITTED',
    },
  });

  return {
    eventId: event.id,
    eventCode: event.code,
    registrationId: registration.id,
    chargeId: charge.id,
    proofId: proof.id,
    revisor: {
      userId: revisor.id,
      assignments: [
        { permissions: ['payment.proof.review'], scope: { type: 'EVENT', eventId: event.id } },
      ],
    },
    inscripciones: {
      userId: gestor.id,
      assignments: [
        {
          permissions: ['registration.read', 'registration.update'],
          scope: { type: 'EVENT', eventId: event.id },
        },
      ],
    },
  };
}

/** Lleva la evidencia hasta aprobada, repartiendo el importe indicado. */
async function aprobar(e: Escenario, reparto: string): Promise<void> {
  const v0 = await prisma.paymentProof.findUniqueOrThrow({
    where: { id: e.proofId },
    select: { version: true },
  });

  await takeProofForReview({ proofs: revision }, e.revisor, {
    eventId: e.eventId,
    proofId: e.proofId,
    expectedVersion: v0.version,
  });

  const v1 = await prisma.paymentProof.findUniqueOrThrow({
    where: { id: e.proofId },
    select: { version: true },
  });

  await reviewPaymentProof({ proofs: revision }, e.revisor, {
    eventId: e.eventId,
    proofId: e.proofId,
    expectedVersion: v1.version,
    outcome: 'APPROVED',
    allocations: [{ chargeId: e.chargeId, amount: money(reparto, USD) }],
  });
}

function estado(registrationId: string) {
  return prisma.registration.findUniqueOrThrow({
    where: { id: registrationId },
    select: { status: true, version: true },
  });
}

function confirmaciones(registrationId: string) {
  return prisma.auditLog.findMany({
    where: { entity: 'registration', entityId: registrationId, action: 'registration.confirm' },
    select: { actorId: true, afterRedacted: true },
  });
}

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('camino derivado: aprobar el pago confirma', () => {
  it('el pago que salda la cuenta confirma la inscripción', async () => {
    const e = await sembrar();

    expect((await estado(e.registrationId)).status).toBe('SUBMITTED');

    await aprobar(e, '420.00');

    expect((await estado(e.registrationId)).status).toBe('CONFIRMED');
  });

  /*
   * Que ocurra en la misma transacción es el punto: si fueran dos operaciones,
   * un fallo entre medias dejaría el pago cobrado y la inscripción sin
   * confirmar, y esa ventana duraría para siempre.
   */
  it('la confirmación queda auditada como derivada del pago', async () => {
    const e = await sembrar();
    await aprobar(e, '420.00');

    const logs = await confirmaciones(e.registrationId);

    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorId).toBe(e.revisor.userId);
    expect(logs[0]?.afterRedacted).toMatchObject({
      status: 'CONFIRMED',
      derivedFrom: 'payment.proof.approve',
    });
  });

  it('el pago parcial deja la inscripción en SUBMITTED (REG-017)', async () => {
    const e = await sembrar({ importe: '210.00' });
    await aprobar(e, '210.00');

    expect((await estado(e.registrationId)).status).toBe('SUBMITTED');
    expect(await confirmaciones(e.registrationId)).toHaveLength(0);
  });

  it('el sobrepago confirma igual que el pago exacto (DEC-008)', async () => {
    const e = await sembrar({ importe: '500.00' });

    // Se reparten 420 contra el cargo; los 80 restantes quedan a favor.
    await aprobar(e, '420.00');

    expect((await estado(e.registrationId)).status).toBe('CONFIRMED');
  });

  it('aprobar sin repartir nada no confirma: el cargo sigue debiéndose', async () => {
    const e = await sembrar();

    const v0 = await prisma.paymentProof.findUniqueOrThrow({
      where: { id: e.proofId },
      select: { version: true },
    });
    await takeProofForReview({ proofs: revision }, e.revisor, {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: v0.version,
    });
    const v1 = await prisma.paymentProof.findUniqueOrThrow({
      where: { id: e.proofId },
      select: { version: true },
    });
    await reviewPaymentProof({ proofs: revision }, e.revisor, {
      eventId: e.eventId,
      proofId: e.proofId,
      expectedVersion: v1.version,
      outcome: 'APPROVED',
      allocations: [],
    });

    expect((await estado(e.registrationId)).status).toBe('SUBMITTED');
  });

  /*
   * Las dos propiedades que justifican que `shouldConfirm` no lance. Si lanzara,
   * la transacción entera se revertiría y un cobro legítimo se perdería por el
   * estado de la inscripción.
   */
  it('una inscripción ya confirmada no rompe la aprobación', async () => {
    const e = await sembrar();

    await prisma.registration.update({
      where: { id: e.registrationId },
      data: { status: 'CONFIRMED' },
    });

    await expect(aprobar(e, '420.00')).resolves.toBeUndefined();

    // El dinero entró igual.
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.receipt.count()).toBe(1);
    expect(await confirmaciones(e.registrationId)).toHaveLength(0);
  });

  it('una inscripción cancelada no rompe la aprobación ni se confirma (REG-009)', async () => {
    const e = await sembrar();

    await prisma.registration.update({
      where: { id: e.registrationId },
      data: { status: 'CANCELLED' },
    });

    await expect(aprobar(e, '420.00')).resolves.toBeUndefined();

    expect((await estado(e.registrationId)).status).toBe('CANCELLED');
    expect(await prisma.payment.count()).toBe(1);
  });
});

describe('camino manual: el botón de Inscripciones', () => {
  it('confirma y audita sin marcar origen derivado', async () => {
    const e = await sembrar({ sinCargo: true });
    const antes = await estado(e.registrationId);

    await confirmRegistration({ registrations: confirmacion }, e.inscripciones, {
      eventId: e.eventId,
      registrationId: e.registrationId,
      expectedVersion: antes.version,
    });

    expect((await estado(e.registrationId)).status).toBe('CONFIRMED');

    const logs = await confirmaciones(e.registrationId);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorId).toBe(e.inscripciones.userId);
    expect(logs[0]?.afterRedacted).toMatchObject({ status: 'CONFIRMED' });
    expect(logs[0]?.afterRedacted).not.toHaveProperty('derivedFrom');
  });

  it('rechaza confirmar con saldo pendiente (REG-017)', async () => {
    const e = await sembrar();
    const antes = await estado(e.registrationId);

    await expect(
      confirmRegistration({ registrations: confirmacion }, e.inscripciones, {
        eventId: e.eventId,
        registrationId: e.registrationId,
        expectedVersion: antes.version,
      }),
    ).rejects.toMatchObject({ code: 'REGISTRATION_NOT_CONFIRMABLE' });

    expect((await estado(e.registrationId)).status).toBe('SUBMITTED');
  });

  it('exige registration.update: leer no basta', async () => {
    const e = await sembrar({ sinCargo: true });
    const antes = await estado(e.registrationId);

    const soloLectura: Actor = {
      userId: e.inscripciones.userId,
      assignments: [
        { permissions: ['registration.read'], scope: { type: 'EVENT', eventId: e.eventId } },
      ],
    };

    await expect(
      confirmRegistration({ registrations: confirmacion }, soloLectura, {
        eventId: e.eventId,
        registrationId: e.registrationId,
        expectedVersion: antes.version,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  /*
   * La carrera que advertí al elegir los dos caminos. Quien tenía la bandeja
   * abierta cuando el revisor aprobó el pago pulsa con una versión vieja.
   *
   * Lo que la detiene **no** es el compare-and-swap: el dominio llega antes,
   * porque `CONFIRMED -> CONFIRMED` no es una transición legal. Sin traducir,
   * eso le diría a quien pulsó «no existe transición de CONFIRMED a CONFIRMED»,
   * que describe un error de programación y no lo que pasó.
   */
  it('pierde la carrera contra el camino derivado, sin duplicar la confirmación', async () => {
    const e = await sembrar();
    const versionQueVioLaPantalla = (await estado(e.registrationId)).version;

    await aprobar(e, '420.00');
    expect((await estado(e.registrationId)).status).toBe('CONFIRMED');

    await expect(
      confirmRegistration({ registrations: confirmacion }, e.inscripciones, {
        eventId: e.eventId,
        registrationId: e.registrationId,
        expectedVersion: versionQueVioLaPantalla,
      }),
    ).rejects.toMatchObject({ code: 'EVENT_VERSION_CONFLICT' });

    // Una sola confirmación en el rastro, la del revisor.
    expect(await confirmaciones(e.registrationId)).toHaveLength(1);
  });

  it('inspectConfirmation explica el rechazo sin tratarlo como error', async () => {
    const e = await sembrar();

    const decision = await inspectConfirmation({ registrations: confirmacion }, e.inscripciones, {
      eventId: e.eventId,
      registrationId: e.registrationId,
    });

    expect(decision).toEqual({ outcome: 'STAY_SUBMITTED', reason: 'OUTSTANDING_BALANCE' });
  });
});

describe('bandeja de inscripciones', () => {
  it('calcula saldo y veredicto en una sola pasada', async () => {
    const e = await sembrar({ importe: '210.00' });
    await aprobar(e, '210.00');

    const filas = await listRegistrationsWithBalance(prisma, e.eventId);

    expect(filas).toHaveLength(1);
    expect(filas[0]?.charged).toBe('420.00');
    expect(filas[0]?.outstanding).toBe('210.00');
    expect(filas[0]?.confirmation).toEqual({
      outcome: 'STAY_SUBMITTED',
      reason: 'OUTSTANDING_BALANCE',
    });
  });

  it('una inscripción ya confirmada no ofrece veredicto', async () => {
    const e = await sembrar();
    await aprobar(e, '420.00');

    const filas = await listRegistrationsWithBalance(prisma, e.eventId);

    expect(filas[0]?.status).toBe('CONFIRMED');
    expect(filas[0]?.outstanding).toBe('0.00');
    expect(filas[0]?.confirmation).toBeNull();
  });

  it('no mezcla inscripciones de otra gestión', async () => {
    const a = await sembrar();
    await sembrar();

    const filas = await listRegistrationsWithBalance(prisma, a.eventId);

    expect(filas).toHaveLength(1);
    expect(filas[0]?.id).toBe(a.registrationId);
  });
});
