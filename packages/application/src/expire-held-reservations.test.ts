import { HELD_DURATION_MS } from '@encuentro/domain';
import { describe, expect, it } from 'vitest';

import { expireHeldReservations } from './expire-held-reservations.js';
import type {
  Clock,
  ExpireReservationInput,
  ReservationRecord,
  ReservationRepository,
} from './ports.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');
const SYSTEM_ACTOR = '00000000-0000-4000-8000-000000000001';

const clock: Clock = { now: () => NOW };

function reservation(overrides: Partial<ReservationRecord> = {}): ReservationRecord {
  const createdAt = new Date(NOW.getTime() - HELD_DURATION_MS - 1000);
  return {
    id: 'res-1',
    eventId: 'evt-1',
    status: 'HELD',
    createdAt,
    heldUntil: new Date(createdAt.getTime() + HELD_DURATION_MS),
    version: 1,
    ...overrides,
  };
}

/** Repositorio falso que registra qué se le pidió expirar. */
function fakeRepository(
  candidates: readonly ReservationRecord[],
  expire: (input: ExpireReservationInput) => boolean = () => true,
): ReservationRepository & { readonly calls: ExpireReservationInput[] } {
  const calls: ExpireReservationInput[] = [];
  return {
    calls,
    findExpiryCandidates: () => Promise.resolve(candidates),
    expire: (input) => {
      calls.push(input);
      return Promise.resolve(expire(input));
    },
  };
}

describe('expireHeldReservations', () => {
  it('expira una retención vencida', async () => {
    const repo = fakeRepository([reservation()]);

    const result = await expireHeldReservations({
      reservations: repo,
      clock,
      systemActorId: SYSTEM_ACTOR,
    });

    expect(result).toEqual({ examined: 1, expired: 1, lost: 0, disagreed: 0 });
    expect(repo.calls[0]?.expectedVersion).toBe(1);
    expect(repo.calls[0]?.actorId).toBe(SYSTEM_ACTOR);
  });

  /*
   * HOS-012. La prueba fuerza el caso peor: la base devuelve por error una
   * reserva CONFIRMED entre las candidatas. El dominio debe frenarla igual.
   */
  it('no expira una reserva CONFIRMED aunque la base la devuelva como candidata', async () => {
    const repo = fakeRepository([reservation({ status: 'CONFIRMED' })]);

    const result = await expireHeldReservations({
      reservations: repo,
      clock,
      systemActorId: SYSTEM_ACTOR,
    });

    expect(result.expired).toBe(0);
    expect(result.disagreed).toBe(1);
    expect(repo.calls).toHaveLength(0);
  });

  it('no expira antes de los 30 minutos de DEC-005', async () => {
    const createdAt = new Date(NOW.getTime() - HELD_DURATION_MS + 1000);
    const repo = fakeRepository([
      reservation({
        createdAt,
        heldUntil: new Date(createdAt.getTime() + HELD_DURATION_MS),
      }),
    ]);

    const result = await expireHeldReservations({
      reservations: repo,
      clock,
      systemActorId: SYSTEM_ACTOR,
    });

    expect(result.expired).toBe(0);
    expect(result.disagreed).toBe(1);
  });

  it('expira exactamente al cumplirse el plazo, no un milisegundo después', async () => {
    const createdAt = new Date(NOW.getTime() - HELD_DURATION_MS);
    const repo = fakeRepository([
      reservation({ createdAt, heldUntil: new Date(createdAt.getTime() + HELD_DURATION_MS) }),
    ]);

    const result = await expireHeldReservations({
      reservations: repo,
      clock,
      systemActorId: SYSTEM_ACTOR,
    });

    expect(result.expired).toBe(1);
  });

  /*
   * Si `held_until` dice que aún no vence pero la regla dice que sí, no se
   * toca. Ante la discrepancia se prefiere no liberar: dejar una cama retenida
   * de más se corrige solo en la siguiente pasada; liberarla de menos se la
   * quita a alguien.
   */
  it('no expira si held_until y la regla de dominio discrepan', async () => {
    const createdAt = new Date(NOW.getTime() - HELD_DURATION_MS - 1000);
    const repo = fakeRepository([
      reservation({ createdAt, heldUntil: new Date(NOW.getTime() + 60_000) }),
    ]);

    const result = await expireHeldReservations({
      reservations: repo,
      clock,
      systemActorId: SYSTEM_ACTOR,
    });

    expect(result.expired).toBe(0);
    expect(result.disagreed).toBe(1);
    expect(repo.calls).toHaveLength(0);
  });

  it('no expira una candidata sin held_until', async () => {
    const repo = fakeRepository([reservation({ heldUntil: null })]);

    const result = await expireHeldReservations({
      reservations: repo,
      clock,
      systemActorId: SYSTEM_ACTOR,
    });

    expect(result.disagreed).toBe(1);
    expect(repo.calls).toHaveLength(0);
  });

  /*
   * Una confirmación que llega en el mismo segundo gana. El worker cuenta la
   * pérdida y sigue: quedar segundo en una carrera es un resultado previsto.
   */
  it('cuenta como perdida la reserva que otro modificó antes', async () => {
    const repo = fakeRepository([reservation()], () => false);

    const result = await expireHeldReservations({
      reservations: repo,
      clock,
      systemActorId: SYSTEM_ACTOR,
    });

    expect(result).toEqual({ examined: 1, expired: 0, lost: 1, disagreed: 0 });
  });

  it('procesa el lote completo aunque alguna pierda la carrera', async () => {
    const candidates = [
      reservation({ id: 'res-1' }),
      reservation({ id: 'res-2' }),
      reservation({ id: 'res-3' }),
    ];
    const repo = fakeRepository(candidates, (input) => input.reservationId !== 'res-2');

    const result = await expireHeldReservations({
      reservations: repo,
      clock,
      systemActorId: SYSTEM_ACTOR,
    });

    expect(result).toEqual({ examined: 3, expired: 2, lost: 1, disagreed: 0 });
  });

  it('no hace nada cuando no hay candidatas', async () => {
    const repo = fakeRepository([]);

    const result = await expireHeldReservations({
      reservations: repo,
      clock,
      systemActorId: SYSTEM_ACTOR,
    });

    expect(result).toEqual({ examined: 0, expired: 0, lost: 0, disagreed: 0 });
  });
});
