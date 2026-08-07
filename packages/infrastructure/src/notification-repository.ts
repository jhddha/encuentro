import type { NotificationRepository, PendingNotification } from '@encuentro/application';

import type { PrismaClient } from './prisma.js';

/**
 * Cola de notificaciones — ADR-007.
 *
 * La única pieza interesante es `claimDue`. Leer y luego marcar sería dos
 * operaciones, y entre ambas otra réplica del worker leería las mismas filas:
 * el peregrino recibiría el correo dos veces. Se resuelve con un `UPDATE ...
 * RETURNING` sobre una subconsulta `FOR UPDATE SKIP LOCKED`, que es la forma
 * estándar de repartir una cola en Postgres sin que dos consumidores se pisen.
 *
 * `SKIP LOCKED` es lo que permite escalar a varias réplicas: en vez de esperar
 * a que se libere una fila tomada por otro worker, la salta y sigue.
 */

interface ClaimedRow {
  id: string;
  event_id: string | null;
  to_email: string;
  attempts: number;
  subject: string;
  body: string;
  variables: unknown;
}

/**
 * Normaliza las variables de la plantilla a `Record<string, string>`.
 *
 * La columna es `Json` y podría contener cualquier cosa. Los valores no textuales
 * se descartan en lugar de convertirse: `renderTemplate` fallará por variable
 * ausente, que es visible y corregible, en vez de escribir `[object Object]`
 * dentro de un correo que ya salió.
 */
function toVariables(value: unknown): Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

export function createNotificationRepository(prisma: PrismaClient): NotificationRepository {
  return {
    async claimDue(now: Date, limit: number) {
      const rows = await prisma.$queryRaw<ClaimedRow[]>`
        WITH claimed AS (
          UPDATE notifications
             SET status = 'SENDING',
                 updated_at = NOW()
           WHERE id IN (
             SELECT id
               FROM notifications
              WHERE status = 'PENDING'
                AND scheduled_at <= ${now}
              ORDER BY scheduled_at ASC
              LIMIT ${limit}
                FOR UPDATE SKIP LOCKED
           )
          RETURNING id, event_id, to_email, attempts, template_id, variables
        )
        SELECT c.id,
               c.event_id,
               c.to_email,
               c.attempts,
               c.variables,
               t.subject,
               t.body
          FROM claimed c
          JOIN notification_templates t ON t.id = c.template_id
      `;

      return rows.map((row): PendingNotification => ({
        id: row.id,
        eventId: row.event_id,
        toEmail: row.to_email,
        subjectTemplate: row.subject,
        bodyTemplate: row.body,
        variables: toVariables(row.variables),
        attempts: row.attempts,
      }));
    },

    async markSent(id: string, sentAt: Date) {
      await prisma.notification.update({
        where: { id },
        data: { status: 'SENT', sentAt, lastError: null },
      });
    },

    /*
     * Un reintento vuelve a `PENDING` con `scheduled_at` en el futuro, en vez
     * de quedarse en `FAILED` esperando que alguien lo reencole. Así la cola
     * tiene una sola consulta de lectura y no hay dos caminos por los que un
     * envío pueda salir.
     *
     * Colapsa dos transiciones del dominio (SENDING -> FAILED -> PENDING) en
     * una sola escritura. El estado intermedio no aporta nada y guardarlo
     * abriría una ventana en la que un envío queda `FAILED` sin fecha de
     * reintento si el proceso muere entre ambas.
     */
    async markFailed(id: string, error: string, retryAt: Date | null) {
      await prisma.notification.update({
        where: { id },
        data:
          retryAt === null
            ? { status: 'FAILED', attempts: { increment: 1 }, lastError: error }
            : {
                status: 'PENDING',
                attempts: { increment: 1 },
                lastError: error,
                scheduledAt: retryAt,
              },
      });
    },
  };
}
