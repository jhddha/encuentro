import { transitionEvent } from '@encuentro/application';
import { createActorResolver, createEventRepository } from '@encuentro/infrastructure';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { requireActor, resetDatabase, seedActor, seedEvent, testPrisma } from './helpers';

/**
 * Gate de P03: transiciones válidas e inválidas, concurrencia y aislamiento.
 *
 * Contra Postgres real. Las pruebas unitarias ya cubren la lógica con un
 * repositorio en memoria; estas comprueban lo que solo la base puede decidir:
 * quién gana una carrera, qué rechaza un constraint y qué queda auditado.
 */
const prisma = testPrisma();
const events = createEventRepository(prisma);
const actors = createActorResolver(prisma);

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

describe('transiciones sobre base real', () => {
  it('recorre el ciclo completo y deja rastro de cada paso', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { userId } = await seedActor(prisma, {
      email: 'admin@encuentro.test',
      permissions: ['event.transition', 'event.close'],
      scopeType: 'EVENT',
      eventId: event.id,
    });

    const actor = await requireActor(actors, userId);

    let version = event.version;
    for (const to of ['READY', 'ACTIVE', 'IN_PROGRESS'] as const) {
      const result = await transitionEvent({ events }, actor, {
        eventId: event.id,
        to,
        expectedVersion: version,
      });
      expect(result.status).toBe(to);
      version = result.version;
    }

    const trail = await prisma.auditLog.findMany({
      where: { entityId: event.id, action: 'event.transition' },
      orderBy: { createdAt: 'asc' },
    });

    expect(trail).toHaveLength(3);
    expect(trail[0]?.beforeRedacted).toMatchObject({ status: 'DRAFT' });
    expect(trail[0]?.afterRedacted).toMatchObject({ status: 'READY' });
    expect(trail[2]?.afterRedacted).toMatchObject({ status: 'IN_PROGRESS' });
  });

  it('una transición inválida no cambia el estado ni escribe auditoría', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { userId } = await seedActor(prisma, {
      email: 'admin@encuentro.test',
      permissions: ['event.transition'],
      scopeType: 'EVENT',
      eventId: event.id,
    });
    const actor = await requireActor(actors, userId);

    await expect(
      transitionEvent({ events }, actor, {
        eventId: event.id,
        to: 'ACTIVE',
        expectedVersion: event.version,
      }),
    ).rejects.toMatchObject({ code: 'EVENT_TRANSITION_INVALID' });

    const row = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.status).toBe('DRAFT');
    expect(row.version).toBe(event.version);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('el cierre desde ACTIVE guarda el motivo en la auditoría', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026, status: 'ACTIVE' });
    const { userId } = await seedActor(prisma, {
      email: 'admin@encuentro.test',
      permissions: ['event.transition', 'event.close'],
      scopeType: 'EVENT',
      eventId: event.id,
    });
    const actor = await requireActor(actors, userId);

    await transitionEvent({ events }, actor, {
      eventId: event.id,
      to: 'OPERATIONALLY_CLOSED',
      expectedVersion: event.version,
      reason: 'Cierre anticipado por alerta meteorológica',
    });

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: event.id, action: 'event.transition' },
    });
    expect(entry.reason).toBe('Cierre anticipado por alerta meteorológica');
    expect(entry.actorId).toBe(userId);
  });
});

describe('concurrencia real', () => {
  it('de dos transiciones simultáneas con la misma versión, solo una se aplica', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { userId } = await seedActor(prisma, {
      email: 'admin@encuentro.test',
      permissions: ['event.transition'],
      scopeType: 'EVENT',
      eventId: event.id,
    });
    const actor = await requireActor(actors, userId);

    // Ambas creen que la versión vigente es la misma. Quien decide es Postgres.
    const results = await Promise.allSettled([
      transitionEvent({ events }, actor, {
        eventId: event.id,
        to: 'READY',
        expectedVersion: event.version,
      }),
      transitionEvent({ events }, actor, {
        eventId: event.id,
        to: 'READY',
        expectedVersion: event.version,
      }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    const row = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.version).toBe(event.version + 1);

    // Y solo hay un registro de auditoría: la perdedora no dejó rastro de un
    // cambio que no ocurrió.
    expect(await prisma.auditLog.count({ where: { action: 'event.transition' } })).toBe(1);
  });

  it('diez intentos simultáneos producen exactamente un ganador', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { userId } = await seedActor(prisma, {
      email: 'admin@encuentro.test',
      permissions: ['event.transition'],
      scopeType: 'EVENT',
      eventId: event.id,
    });
    const actor = await requireActor(actors, userId);

    const attempts = Array.from({ length: 10 }, () =>
      transitionEvent({ events }, actor, {
        eventId: event.id,
        to: 'READY',
        expectedVersion: event.version,
      }),
    );

    const results = await Promise.allSettled(attempts);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const row = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.version).toBe(event.version + 1);
  });
});

describe('aislamiento entre gestiones (IDOR)', () => {
  it('un actor con permiso en una gestión no puede transicionar otra', async () => {
    const a = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const b = await seedEvent(prisma, { code: 'ENC2027', year: 2027 });

    const { userId } = await seedActor(prisma, {
      email: 'operador@encuentro.test',
      permissions: ['event.transition'],
      scopeType: 'EVENT',
      eventId: a.id,
    });
    const actor = await requireActor(actors, userId);

    await expect(
      transitionEvent({ events }, actor, {
        eventId: b.id,
        to: 'READY',
        expectedVersion: b.version,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const untouched = await prisma.event.findUniqueOrThrow({ where: { id: b.id } });
    expect(untouched.status).toBe('DRAFT');
    expect(untouched.version).toBe(b.version);
  });

  it('un actor con scope de caja no alcanza el nivel de gestión', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { userId } = await seedActor(prisma, {
      email: 'cajero@encuentro.test',
      permissions: ['event.transition'],
      scopeType: 'CASH',
      eventId: event.id,
      cashAccountId: 'CAJA-01',
    });
    const actor = await requireActor(actors, userId);

    await expect(
      transitionEvent({ events }, actor, {
        eventId: event.id,
        to: 'READY',
        expectedVersion: event.version,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('un actor con scope GLOBAL sí alcanza cualquier gestión', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { userId } = await seedActor(prisma, {
      email: 'master@encuentro.test',
      permissions: ['event.transition'],
      scopeType: 'GLOBAL',
    });
    const actor = await requireActor(actors, userId);

    const result = await transitionEvent({ events }, actor, {
      eventId: event.id,
      to: 'READY',
      expectedVersion: event.version,
    });
    expect(result.status).toBe('READY');
  });

  it('una cuenta inactiva pierde todos sus permisos', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { userId } = await seedActor(prisma, {
      email: 'suspendido@encuentro.test',
      permissions: ['event.transition'],
      scopeType: 'GLOBAL',
    });

    await prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } });

    expect(await actors.resolve(userId)).toBeNull();
    const row = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.status).toBe('DRAFT');
  });
});

describe('invariantes impuestas por la base', () => {
  it('rechaza dos gestiones con el mismo código', async () => {
    await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    await expect(seedEvent(prisma, { code: 'ENC2026', year: 2027 })).rejects.toThrow();
  });

  it('rechaza dos gestiones para el mismo año', async () => {
    await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    await expect(seedEvent(prisma, { code: 'OTRO', year: 2026 })).rejects.toThrow();
  });

  it('rechaza fechas invertidas', async () => {
    await expect(
      seedEvent(prisma, {
        code: 'ENC2026',
        year: 2026,
        startAt: new Date('2026-11-08T00:00:00Z'),
        endAt: new Date('2026-11-01T00:00:00Z'),
      }),
    ).rejects.toThrow();
  });

  it('impide modificar la auditoría, aunque se intente por SQL directo', async () => {
    const event = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const { userId } = await seedActor(prisma, {
      email: 'admin@encuentro.test',
      permissions: ['event.transition'],
      scopeType: 'GLOBAL',
    });
    const actor = await requireActor(actors, userId);

    await transitionEvent({ events }, actor, {
      eventId: event.id,
      to: 'READY',
      expectedVersion: event.version,
    });

    // GOV-005 y GOV-009: el histórico no se reescribe. La garantía es del
    // trigger, así que se comprueba con SQL crudo y no por el repositorio.
    await expect(
      prisma.$executeRawUnsafe(`UPDATE audit_logs SET action = 'alterado'`),
    ).rejects.toThrow(/append-only/);

    await expect(prisma.$executeRawUnsafe('DELETE FROM audit_logs')).rejects.toThrow(/append-only/);
  });

  it('solo permite una gestión públicamente habilitada (EVT-006)', async () => {
    const a = await seedEvent(prisma, { code: 'ENC2026', year: 2026 });
    const b = await seedEvent(prisma, { code: 'ENC2027', year: 2027 });

    await prisma.event.update({ where: { id: a.id }, data: { publiclyEnabled: true } });

    await expect(
      prisma.event.update({ where: { id: b.id }, data: { publiclyEnabled: true } }),
    ).rejects.toThrow();
  });
});
