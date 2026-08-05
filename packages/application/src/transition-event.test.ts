import { DomainError, type Actor, type EventState } from '@encuentro/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ApplyTransitionInput, EventRecord, EventRepository } from './ports.js';
import { transitionEvent } from './transition-event.js';

const EVENT_ID = 'evt-1';
const OTHER_EVENT_ID = 'evt-2';

/**
 * Repositorio en memoria que reproduce el compare-and-swap real: solo aplica el
 * cambio si `expectedVersion` coincide con la versión almacenada.
 */
class FakeEventRepository implements EventRepository {
  private record: EventRecord;
  readonly transitions: ApplyTransitionInput[] = [];

  constructor(status: EventState, version = 3) {
    this.record = {
      id: EVENT_ID,
      code: 'ENC2026',
      year: 2026,
      name: 'Encuentro 2026',
      timezone: 'America/La_Paz',
      currency: 'USD',
      startAt: new Date('2026-11-01T00:00:00Z'),
      endAt: new Date('2026-11-08T23:59:59Z'),
      status,
      version,
      publiclyEnabled: false,
    };
  }

  findById(id: string): Promise<EventRecord | null> {
    return Promise.resolve(id === this.record.id ? this.record : null);
  }

  findByCode(): Promise<EventRecord | null> {
    return Promise.resolve(null);
  }

  list(): Promise<readonly EventRecord[]> {
    return Promise.resolve([this.record]);
  }

  findPubliclyEnabled(): Promise<EventRecord | null> {
    return Promise.resolve(null);
  }

  create(): Promise<EventRecord> {
    return Promise.resolve(this.record);
  }

  applyTransition(input: ApplyTransitionInput): Promise<EventRecord | null> {
    this.transitions.push(input);

    if (input.expectedVersion !== this.record.version) {
      return Promise.resolve(null);
    }

    this.record = { ...this.record, status: input.to, version: this.record.version + 1 };
    return Promise.resolve(this.record);
  }

  get current(): EventRecord {
    return this.record;
  }
}

function actorWithPermissions(permissions: readonly string[], eventId = EVENT_ID): Actor {
  return {
    userId: 'u-admin',
    assignments: [{ permissions, scope: { type: 'EVENT', eventId } }],
  };
}

const fullActor = actorWithPermissions(['event.transition', 'event.close']);

describe('transiciones válidas', () => {
  it('avanza de DRAFT a READY', async () => {
    const repo = new FakeEventRepository('DRAFT');
    const result = await transitionEvent({ events: repo }, fullActor, {
      eventId: EVENT_ID,
      to: 'READY',
      expectedVersion: 3,
    });

    expect(result.status).toBe('READY');
    expect(result.version).toBe(4);
  });

  it('permite volver de READY a DRAFT para corregir configuración', async () => {
    const repo = new FakeEventRepository('READY');
    const result = await transitionEvent({ events: repo }, fullActor, {
      eventId: EVENT_ID,
      to: 'DRAFT',
      expectedVersion: 3,
    });

    expect(result.status).toBe('DRAFT');
  });

  it('pasa de ACTIVE a IN_PROGRESS sin exigir motivo', async () => {
    const repo = new FakeEventRepository('ACTIVE');
    const result = await transitionEvent({ events: repo }, fullActor, {
      eventId: EVENT_ID,
      to: 'IN_PROGRESS',
      expectedVersion: 3,
    });

    expect(result.status).toBe('IN_PROGRESS');
  });
});

describe('transiciones inválidas', () => {
  it('rechaza saltarse READY', async () => {
    const repo = new FakeEventRepository('DRAFT');
    await expect(
      transitionEvent({ events: repo }, fullActor, {
        eventId: EVENT_ID,
        to: 'ACTIVE',
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'EVENT_TRANSITION_INVALID' });
  });

  it('rechaza retroceder de IN_PROGRESS a ACTIVE', async () => {
    const repo = new FakeEventRepository('IN_PROGRESS');
    await expect(
      transitionEvent({ events: repo }, fullActor, {
        eventId: EVENT_ID,
        to: 'ACTIVE',
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'EVENT_TRANSITION_INVALID' });
  });

  it('rechaza reabrir una gestión archivada', async () => {
    const repo = new FakeEventRepository('ARCHIVED');
    await expect(
      transitionEvent({ events: repo }, fullActor, {
        eventId: EVENT_ID,
        to: 'DRAFT',
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'EVENT_TRANSITION_INVALID' });
  });

  it('no escribe nada cuando la transición es inválida', async () => {
    const repo = new FakeEventRepository('DRAFT');
    await expect(
      transitionEvent({ events: repo }, fullActor, {
        eventId: EVENT_ID,
        to: 'ARCHIVED',
        expectedVersion: 3,
      }),
    ).rejects.toThrow(DomainError);

    expect(repo.transitions).toHaveLength(0);
    expect(repo.current.status).toBe('DRAFT');
  });
});

describe('motivo obligatorio en el cierre anticipado (EVT-003)', () => {
  it('rechaza cerrar desde ACTIVE sin motivo', async () => {
    const repo = new FakeEventRepository('ACTIVE');
    await expect(
      transitionEvent({ events: repo }, fullActor, {
        eventId: EVENT_ID,
        to: 'OPERATIONALLY_CLOSED',
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'EVENT_TRANSITION_REASON_REQUIRED' });
  });

  it('rechaza un motivo en blanco', async () => {
    const repo = new FakeEventRepository('ACTIVE');
    await expect(
      transitionEvent({ events: repo }, fullActor, {
        eventId: EVENT_ID,
        to: 'OPERATIONALLY_CLOSED',
        expectedVersion: 3,
        reason: '   ',
      }),
    ).rejects.toMatchObject({ code: 'EVENT_TRANSITION_REASON_REQUIRED' });
  });

  it('acepta el cierre con motivo y lo propaga a la auditoría', async () => {
    const repo = new FakeEventRepository('ACTIVE');
    await transitionEvent({ events: repo }, fullActor, {
      eventId: EVENT_ID,
      to: 'OPERATIONALLY_CLOSED',
      expectedVersion: 3,
      reason: 'Suspensión por alerta meteorológica',
    });

    expect(repo.transitions[0]?.reason).toBe('Suspensión por alerta meteorológica');
  });

  it('no exige motivo al cerrar desde IN_PROGRESS', async () => {
    const repo = new FakeEventRepository('IN_PROGRESS');
    const result = await transitionEvent({ events: repo }, fullActor, {
      eventId: EVENT_ID,
      to: 'OPERATIONALLY_CLOSED',
      expectedVersion: 3,
    });

    expect(result.status).toBe('OPERATIONALLY_CLOSED');
  });
});

describe('concurrencia (compare-and-swap)', () => {
  it('rechaza una versión obsoleta', async () => {
    const repo = new FakeEventRepository('DRAFT', 7);
    await expect(
      transitionEvent({ events: repo }, fullActor, {
        eventId: EVENT_ID,
        to: 'READY',
        expectedVersion: 6,
      }),
    ).rejects.toMatchObject({ code: 'EVENT_VERSION_CONFLICT' });

    expect(repo.current.status).toBe('DRAFT');
  });

  it('de dos transiciones concurrentes con la misma versión, solo una gana', async () => {
    const repo = new FakeEventRepository('DRAFT', 3);

    const results = await Promise.allSettled([
      transitionEvent({ events: repo }, fullActor, {
        eventId: EVENT_ID,
        to: 'READY',
        expectedVersion: 3,
      }),
      transitionEvent({ events: repo }, fullActor, {
        eventId: EVENT_ID,
        to: 'READY',
        expectedVersion: 3,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // La versión avanza exactamente una vez: la perdedora no se aplicó.
    expect(repo.current.version).toBe(4);
  });
});

describe('autorización y aislamiento', () => {
  let repo: FakeEventRepository;

  beforeEach(() => {
    repo = new FakeEventRepository('DRAFT');
  });

  it('rechaza a quien no tiene event.transition', async () => {
    const readOnly = actorWithPermissions(['event.read']);
    await expect(
      transitionEvent({ events: repo }, readOnly, {
        eventId: EVENT_ID,
        to: 'READY',
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rechaza a quien tiene el permiso en otra gestión — IDOR', async () => {
    const otherEvent = actorWithPermissions(['event.transition'], OTHER_EVENT_ID);
    await expect(
      transitionEvent({ events: repo }, otherEvent, {
        eventId: EVENT_ID,
        to: 'READY',
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('comprueba el permiso antes de leer la gestión', async () => {
    // Un actor sin permiso recibe FORBIDDEN aunque la gestión ni siquiera
    // exista: el error no debe servir para averiguar qué identificadores son
    // válidos.
    const outsider: Actor = { userId: 'u-x', assignments: [] };
    await expect(
      transitionEvent({ events: repo }, outsider, {
        eventId: 'evt-inexistente',
        to: 'READY',
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('exige event.close además de event.transition para el cierre operativo', async () => {
    const closeRepo = new FakeEventRepository('IN_PROGRESS');
    const withoutClose = actorWithPermissions(['event.transition']);

    await expect(
      transitionEvent({ events: closeRepo }, withoutClose, {
        eventId: EVENT_ID,
        to: 'OPERATIONALLY_CLOSED',
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(closeRepo.transitions).toHaveLength(0);
  });
});
