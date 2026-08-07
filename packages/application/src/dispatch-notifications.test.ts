import { MAX_DELIVERY_ATTEMPTS, nextRetryDelayMs } from '@encuentro/domain';
import { describe, expect, it } from 'vitest';

import { dispatchNotifications } from './dispatch-notifications.js';
import type {
  Clock,
  EmailMessage,
  EmailSender,
  NotificationRepository,
  PendingNotification,
} from './ports.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');
const clock: Clock = { now: () => NOW };

function pending(overrides: Partial<PendingNotification> = {}): PendingNotification {
  return {
    id: 'ntf-1',
    eventId: 'evt-1',
    toEmail: 'peregrino@example.org',
    subjectTemplate: 'Pago aprobado — {{receiptNumber}}',
    bodyTemplate: 'Hola {{name}}, su pago de {{amount}} fue aprobado.',
    variables: { receiptNumber: 'REC-ENC26-000012', name: 'Ana', amount: 'Bs 350,00' },
    attempts: 0,
    ...overrides,
  };
}

interface FakeRepo extends NotificationRepository {
  readonly sent: { id: string; at: Date }[];
  readonly failed: { id: string; error: string; retryAt: Date | null }[];
}

function fakeRepository(claimed: readonly PendingNotification[]): FakeRepo {
  const sent: { id: string; at: Date }[] = [];
  const failed: { id: string; error: string; retryAt: Date | null }[] = [];

  return {
    sent,
    failed,
    claimDue: () => Promise.resolve(claimed),
    markSent: (id, at) => {
      sent.push({ id, at });
      return Promise.resolve();
    },
    markFailed: (id, error, retryAt) => {
      failed.push({ id, error, retryAt });
      return Promise.resolve();
    },
  };
}

function sender(behaviour: (message: EmailMessage) => void = () => undefined): EmailSender & {
  readonly messages: EmailMessage[];
} {
  const messages: EmailMessage[] = [];
  return {
    messages,
    send: (message) => {
      messages.push(message);
      behaviour(message);
      return Promise.resolve();
    },
  };
}

function failingSender(message: string): EmailSender {
  return {
    send: () => Promise.reject(new Error(message)),
  };
}

describe('dispatchNotifications', () => {
  it('renderiza la plantilla y marca el envío como enviado', async () => {
    const repo = fakeRepository([pending()]);
    const email = sender();

    const result = await dispatchNotifications({ notifications: repo, email, clock });

    expect(result).toEqual({ claimed: 1, sent: 1, retrying: 0, abandoned: 0 });
    expect(email.messages[0]?.subject).toBe('Pago aprobado — REC-ENC26-000012');
    expect(email.messages[0]?.body).toBe('Hola Ana, su pago de Bs 350,00 fue aprobado.');
    expect(repo.sent).toEqual([{ id: 'ntf-1', at: NOW }]);
  });

  /*
   * La distinción central de este caso de uso: un SMTP caído se reintenta, una
   * plantilla rota no. Reintentar lo determinista consume la cola sin cambiar
   * el resultado.
   */
  it('reintenta un fallo de SMTP con la espera de dominio', async () => {
    const repo = fakeRepository([pending({ attempts: 0 })]);

    const result = await dispatchNotifications({
      notifications: repo,
      email: failingSender('conexión rechazada'),
      clock,
    });

    expect(result.retrying).toBe(1);
    expect(result.abandoned).toBe(0);
    expect(repo.failed[0]?.retryAt).toEqual(new Date(NOW.getTime() + nextRetryDelayMs(1)));
    expect(repo.failed[0]?.error).toBe('conexión rechazada');
  });

  it('no reintenta una plantilla a la que le falta una variable', async () => {
    const repo = fakeRepository([pending({ variables: { name: 'Ana' } })]);
    const email = sender();

    const result = await dispatchNotifications({ notifications: repo, email, clock });

    expect(result).toEqual({ claimed: 1, sent: 0, retrying: 0, abandoned: 1 });
    expect(repo.failed[0]?.retryAt).toBeNull();
    // No se intentó enviar: un correo con un hueco es peor que ningún correo.
    expect(email.messages).toHaveLength(0);
  });

  it('abandona el envío al agotar los intentos', async () => {
    const repo = fakeRepository([pending({ attempts: MAX_DELIVERY_ATTEMPTS - 1 })]);

    const result = await dispatchNotifications({
      notifications: repo,
      email: failingSender('timeout'),
      clock,
    });

    expect(result.abandoned).toBe(1);
    expect(result.retrying).toBe(0);
    expect(repo.failed[0]?.retryAt).toBeNull();
  });

  it('un fallo no detiene el resto del lote', async () => {
    const repo = fakeRepository([
      pending({ id: 'ntf-1' }),
      pending({ id: 'ntf-2', variables: {} }),
      pending({ id: 'ntf-3' }),
    ]);
    const email = sender();

    const result = await dispatchNotifications({ notifications: repo, email, clock });

    expect(result).toEqual({ claimed: 3, sent: 2, retrying: 0, abandoned: 1 });
    expect(repo.sent.map((s) => s.id)).toEqual(['ntf-1', 'ntf-3']);
  });

  /*
   * El mensaje que se guarda en `last_error` es el texto del error, no el
   * objeto. Una traza de SMTP puede arrastrar credenciales de conexión y esta
   * columna se lee desde el panel.
   */
  it('guarda solo el mensaje del error, no el objeto', async () => {
    const repo = fakeRepository([pending()]);

    await dispatchNotifications({
      notifications: repo,
      email: { send: () => Promise.reject(new Error('535 auth fallida')) },
      clock,
    });

    expect(repo.failed[0]?.error).toBe('535 auth fallida');
  });

  it('no hace nada cuando no hay envíos vencidos', async () => {
    const repo = fakeRepository([]);
    const email = sender();

    const result = await dispatchNotifications({ notifications: repo, email, clock });

    expect(result).toEqual({ claimed: 0, sent: 0, retrying: 0, abandoned: 0 });
    expect(email.messages).toHaveLength(0);
  });
});
