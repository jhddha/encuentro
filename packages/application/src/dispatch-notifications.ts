import { DomainError, nextRetryDelayMs, renderTemplate, shouldRetry } from '@encuentro/domain';

import type { Clock, EmailSender, NotificationRepository, PendingNotification } from './ports.js';

/**
 * Envío de notificaciones pendientes — GOV-007, GOV-008, ADR-007.
 *
 * Corre en el worker (DEC-001). El envío nunca ocurre dentro de la petición que
 * lo originó: GOV-008 exige que una falla de integración no revierta una
 * operación confirmada, y la única forma de garantizarlo es que el pago ya esté
 * cerrado en su propia transacción cuando el correo se intenta.
 *
 * La distinción que gobierna este caso de uso es **qué fallos merecen
 * reintento**:
 *
 *  - Un SMTP caído es transitorio. Se reintenta con espera creciente.
 *  - Una plantilla a la que le falta una variable es determinista. Reintentarla
 *    cinco veces produce cinco veces el mismo error y retrasa la cola. Se marca
 *    fallida de una vez y se deja visible para que alguien la corrija.
 *
 * Confundir ambos casos es el defecto habitual de las colas de correo: una
 * plantilla rota consume todos los reintentos de todos los envíos que la usan.
 */

export interface DispatchNotificationsDeps {
  readonly notifications: NotificationRepository;
  readonly email: EmailSender;
  readonly clock: Clock;
}

export interface DispatchNotificationsResult {
  readonly claimed: number;
  readonly sent: number;
  /** Fallidos que volverán a intentarse. */
  readonly retrying: number;
  /** Fallidos definitivamente: intentos agotados o error determinista. */
  readonly abandoned: number;
}

const BATCH_LIMIT = 50;

export async function dispatchNotifications(
  deps: DispatchNotificationsDeps,
  limit: number = BATCH_LIMIT,
): Promise<DispatchNotificationsResult> {
  const now = deps.clock.now();
  const claimed = await deps.notifications.claimDue(now, limit);

  let sent = 0;
  let retrying = 0;
  let abandoned = 0;

  for (const notification of claimed) {
    const message = render(notification);

    if (message === null) {
      // Error determinista: sin reintento. El detalle del fallo lo produce
      // `renderTemplate` y ya lo hemos capturado abajo.
      await deps.notifications.markFailed(
        notification.id,
        'La plantilla no pudo renderizarse; faltan variables. No se reintenta.',
        null,
      );
      abandoned += 1;
      continue;
    }

    try {
      await deps.email.send({
        to: notification.toEmail,
        subject: message.subject,
        body: message.body,
      });
      await deps.notifications.markSent(notification.id, deps.clock.now());
      sent += 1;
    } catch (error) {
      const attempts = notification.attempts + 1;

      if (shouldRetry('FAILED', attempts)) {
        const retryAt = new Date(deps.clock.now().getTime() + nextRetryDelayMs(attempts));
        await deps.notifications.markFailed(notification.id, describe(error), retryAt);
        retrying += 1;
      } else {
        await deps.notifications.markFailed(notification.id, describe(error), null);
        abandoned += 1;
      }
    }
  }

  return { claimed: claimed.length, sent, retrying, abandoned };
}

function render(
  notification: PendingNotification,
): { readonly subject: string; readonly body: string } | null {
  try {
    return {
      subject: renderTemplate(notification.subjectTemplate, notification.variables),
      body: renderTemplate(notification.bodyTemplate, notification.variables),
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return null;
    }
    throw error;
  }
}

/**
 * Texto del fallo para `last_error`.
 *
 * Solo el mensaje, nunca el objeto completo: la traza de un error de SMTP
 * puede arrastrar credenciales de la conexión, y esta columna se lee desde el
 * panel (regla 03-security-rbac).
 */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Fallo desconocido en el envío.';
}
