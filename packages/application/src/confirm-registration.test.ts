import { DomainError, money, type Actor } from '@encuentro/domain';
import { describe, expect, it } from 'vitest';

import {
  confirmRegistration,
  inspectConfirmation,
  type ConfirmRegistrationInput,
  type RegistrationConfirmationRepository,
  type RegistrationForConfirmation,
} from './confirm-registration.js';

const EVENTO = 'evt-1';
const INSCRIPCION = 'reg-1';
const USD = 'USD';

function actor(permisos: readonly string[] = ['registration.read', 'registration.update']): Actor {
  return {
    userId: 'user-1',
    assignments: [
      {
        permissions: permisos,
        scope: { type: 'EVENT', eventId: EVENTO },
      },
    ],
  };
}

function inscripcion(
  overrides: Partial<RegistrationForConfirmation> = {},
): RegistrationForConfirmation {
  return {
    id: INSCRIPCION,
    eventId: EVENTO,
    eventStatus: 'ACTIVE',
    status: 'SUBMITTED',
    currency: USD,
    charges: [money('420.00', USD)],
    allocations: [money('420.00', USD)],
    fullExemptionApproved: false,
    version: 3,
    ...overrides,
  };
}

interface RepoFalso extends RegistrationConfirmationRepository {
  readonly llamadas: ConfirmRegistrationInput[];
}

function repositorio(
  registro: RegistrationForConfirmation | null,
  confirmar: () => boolean = () => true,
): RepoFalso {
  const llamadas: ConfirmRegistrationInput[] = [];
  return {
    llamadas,
    findForConfirmation: () => Promise.resolve(registro),
    confirm: (input) => {
      llamadas.push(input);
      return Promise.resolve(confirmar());
    },
  };
}

describe('confirmRegistration', () => {
  it('confirma cuando el saldo está cubierto', async () => {
    const repo = repositorio(inscripcion());

    await confirmRegistration({ registrations: repo }, actor(), {
      eventId: EVENTO,
      registrationId: INSCRIPCION,
      expectedVersion: 3,
    });

    expect(repo.llamadas).toEqual([
      { registrationId: INSCRIPCION, expectedVersion: 3, actorId: 'user-1' },
    ]);
  });

  /*
   * El caso que REG-017 existe para impedir, y la razón por la que el saldo se
   * calcula aquí en vez de recibirse: quien paga la mitad no queda inscrito.
   */
  it('rechaza con pago parcial y no escribe nada', async () => {
    const repo = repositorio(inscripcion({ allocations: [money('210.00', USD)] }));

    await expect(
      confirmRegistration({ registrations: repo }, actor(), {
        eventId: EVENTO,
        registrationId: INSCRIPCION,
        expectedVersion: 3,
      }),
    ).rejects.toThrow(DomainError);

    expect(repo.llamadas).toHaveLength(0);
  });

  it('confirma con sobrepago', async () => {
    const repo = repositorio(inscripcion({ allocations: [money('500.00', USD)] }));

    await confirmRegistration({ registrations: repo }, actor(), {
      eventId: EVENTO,
      registrationId: INSCRIPCION,
      expectedVersion: 3,
    });

    expect(repo.llamadas).toHaveLength(1);
  });

  it('exige el permiso de escritura', async () => {
    const repo = repositorio(inscripcion());

    await expect(
      confirmRegistration({ registrations: repo }, actor(['registration.read']), {
        eventId: EVENTO,
        registrationId: INSCRIPCION,
        expectedVersion: 3,
      }),
    ).rejects.toThrow(DomainError);

    expect(repo.llamadas).toHaveLength(0);
  });

  /*
   * IDOR: una inscripción de otra gestión debe responder lo mismo que una
   * inexistente. Distinguirlas permitiría enumerarlas.
   */
  it('no revela inscripciones de otra gestión', async () => {
    const repo = repositorio(inscripcion({ eventId: 'otro-evento' }));

    await expect(
      confirmRegistration({ registrations: repo }, actor(), {
        eventId: EVENTO,
        registrationId: INSCRIPCION,
        expectedVersion: 3,
      }),
    ).rejects.toThrow(/no está disponible/);
  });

  it('responde igual cuando la inscripción no existe', async () => {
    const repo = repositorio(null);

    await expect(
      confirmRegistration({ registrations: repo }, actor(), {
        eventId: EVENTO,
        registrationId: INSCRIPCION,
        expectedVersion: 3,
      }),
    ).rejects.toThrow(/no está disponible/);
  });

  /* GOV-003 y GOV-004. */
  it.each(['DRAFT', 'READY', 'OPERATIONALLY_CLOSED', 'FINANCIALLY_CLOSED', 'ARCHIVED'] as const)(
    'no confirma con la gestión en %s',
    async (estado) => {
      const repo = repositorio(inscripcion({ eventStatus: estado }));

      await expect(
        confirmRegistration({ registrations: repo }, actor(), {
          eventId: EVENTO,
          registrationId: INSCRIPCION,
          expectedVersion: 3,
        }),
      ).rejects.toThrow(/no admite confirmaciones/);

      expect(repo.llamadas).toHaveLength(0);
    },
  );

  it('confirma durante IN_PROGRESS: llegar tarde no impide inscribirse', async () => {
    const repo = repositorio(inscripcion({ eventStatus: 'IN_PROGRESS' }));

    await confirmRegistration({ registrations: repo }, actor(), {
      eventId: EVENTO,
      registrationId: INSCRIPCION,
      expectedVersion: 3,
    });

    expect(repo.llamadas).toHaveLength(1);
  });

  it('falla si otra operación se adelantó', async () => {
    const repo = repositorio(inscripcion(), () => false);

    await expect(
      confirmRegistration({ registrations: repo }, actor(), {
        eventId: EVENTO,
        registrationId: INSCRIPCION,
        expectedVersion: 3,
      }),
    ).rejects.toThrow(/cambió mientras preparaba/);
  });

  /*
   * Con dos caminos hacia `CONFIRMED`, encontrar la inscripción ya confirmada
   * es una carrera, no un error de programación. Sin traducir, quien pulsó el
   * botón leería «no existe transición de CONFIRMED a CONFIRMED».
   *
   * Cancelada recibe la misma respuesta y por la misma razón: lo que la persona
   * necesita saber es que la pantalla está vieja.
   */
  it.each(['CONFIRMED', 'CANCELLED'] as const)(
    'una inscripción en %s se traduce a conflicto de versión, no a transición inválida',
    async (estado) => {
      const repo = repositorio(inscripcion({ status: estado }));

      let thrown: unknown;
      try {
        await confirmRegistration({ registrations: repo }, actor(), {
          eventId: EVENTO,
          registrationId: INSCRIPCION,
          expectedVersion: 3,
        });
      } catch (error) {
        thrown = error;
      }

      expect((thrown as DomainError).code).toBe('EVENT_VERSION_CONFLICT');
      expect((thrown as DomainError).message).toMatch(/cambió mientras preparaba/);
      expect(repo.llamadas).toHaveLength(0);
    },
  );
});

describe('inspectConfirmation', () => {
  it('informa del motivo sin escribir ni lanzar', async () => {
    const repo = repositorio(inscripcion({ allocations: [money('100.00', USD)] }));

    const decision = await inspectConfirmation({ registrations: repo }, actor(), {
      eventId: EVENTO,
      registrationId: INSCRIPCION,
    });

    expect(decision).toEqual({ outcome: 'STAY_SUBMITTED', reason: 'OUTSTANDING_BALANCE' });
    expect(repo.llamadas).toHaveLength(0);
  });

  it('basta el permiso de lectura', async () => {
    const repo = repositorio(inscripcion());

    const decision = await inspectConfirmation(
      { registrations: repo },
      actor(['registration.read']),
      { eventId: EVENTO, registrationId: INSCRIPCION },
    );

    expect(decision).toEqual({ outcome: 'CONFIRM' });
  });
});
