import {
  DomainError,
  MAX_DELIVERY_ATTEMPTS,
  nextRetryDelayMs,
  renderTemplate,
  shouldRetry,
} from '@encuentro/domain';

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
  /**
   * Correos **entregados** cuyo resultado no se pudo escribir.
   *
   * El envío salió y la base falló al anotarlo. La fila se queda en `SENDING` y
   * la recuperación de reclamaciones abandonadas la retomará más tarde, lo que
   * puede producir un duplicado. Es lo menos malo: ver el comentario del
   * `catch`.
   */
  readonly unrecorded: number;
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
  let unrecorded = 0;

  for (const notification of claimed) {
    /*
     * Tope antes de enviar, no solo después de fallar.
     *
     * `attempts` cuenta intentos consumidos, y una recuperación consume uno.
     * Una fila que llegue aquí con la cuota agotada ya salió tantas veces como
     * la política permite; volver a enviarla sería exactamente el reenvío
     * indefinido que NTF-009 prohíbe.
     *
     * Para una fila que viene de `PENDING` esta rama no se alcanza: al quinto
     * fallo se abandona y no vuelve a la cola. Solo la alcanzan las recuperadas.
     */
    if (notification.attempts >= MAX_DELIVERY_ATTEMPTS) {
      await deps.notifications.markExhausted(
        notification.id,
        `Se agotaron los ${String(MAX_DELIVERY_ATTEMPTS)} intentos de entrega. No se reintenta.`,
      );
      abandoned += 1;
      continue;
    }

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

    /*
     * El envío y su registro son dos fallos distintos, y confundirlos era un
     * defecto: `markSent` estaba dentro de este `try`, así que un tropiezo de la
     * base **después de que el correo saliera** se trataba como fallo de envío y
     * reprogramaba un mensaje ya entregado. El peregrino lo recibía dos veces.
     */
    try {
      await deps.email.send({
        to: notification.toEmail,
        subject: message.subject,
        body: message.body,
      });
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

      continue;
    }

    /*
     * A partir de aquí el correo YA SALIÓ. Lo único que puede fallar es
     * anotarlo, y ante ese fallo no se toca la fila: marcarla `PENDING` la
     * reenviaría con certeza.
     *
     * Se deja en `SENDING`. La recuperación de reclamaciones abandonadas la
     * retomará pasados diez minutos, así que puede acabar duplicándose — pero
     * solo si la base estuvo caída en esa ventana concreta, en vez de duplicarse
     * siempre que la base tropiece un instante.
     */
    try {
      await deps.notifications.markSent(notification.id, deps.clock.now());
      sent += 1;
    } catch {
      unrecorded += 1;
    }
  }

  return { claimed: claimed.length, sent, retrying, abandoned, unrecorded };
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
