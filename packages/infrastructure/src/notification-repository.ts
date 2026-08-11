import type { NotificationRepository, PendingNotification } from '@encuentro/application';
import { STALE_SENDING_MS } from '@encuentro/domain';

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
      /*
       * El instante a partir del cual una reclamación se da por abandonada.
       *
       * Se calcula aquí y se pasa como parámetro en vez de usar `NOW()` de
       * Postgres, para que la política siga viniendo del dominio y del reloj
       * inyectado, no del reloj del servidor de base de datos.
       */
      const staleBefore = new Date(now.getTime() - STALE_SENDING_MS);

      const rows = await prisma.$queryRaw<ClaimedRow[]>`
        WITH claimed AS (
          UPDATE notifications
             SET status = 'SENDING',
                 updated_at = NOW(),
                 -- Una recuperacion consume un intento; una reclamacion normal
                 -- no. En un UPDATE, la parte derecha ve todavia el valor viejo
                 -- de status, asi que esto distingue las dos ramas del WHERE.
                 --
                 -- Sin esto, una fila que reproduzca el fallo DESPUES de enviar
                 -- —markSent que falla siempre, o el proceso muerto entre el
                 -- envio y su registro— se reclamaba cada diez minutos para
                 -- siempre: el correo salia otra vez en cada ciclo y
                 -- MAX_DELIVERY_ATTEMPTS no aplicaba nunca porque attempts no
                 -- avanzaba. NTF-009 exige que un fallo permanente termine en
                 -- cola muerta, y por este camino no terminaba jamas.
                 attempts = attempts + CASE WHEN status = 'SENDING' THEN 1 ELSE 0 END
           WHERE id IN (
             SELECT id
               FROM notifications
              WHERE (status = 'PENDING' AND scheduled_at <= ${now})
                 -- Recuperacion de reclamaciones abandonadas (GOV-008).
                 -- Sin esta rama, un envio que quedo en SENDING porque el
                 -- worker murio a mitad de tanda no volvia NUNCA: la consulta
                 -- solo miraba PENDING. updated_at se fija al reclamar, asi que
                 -- es la marca de cuando alguien lo tomo. La ventana es amplia
                 -- (ver STALE_SENDING_MS) porque reclamar un envio todavia en
                 -- curso produciria un duplicado.
                 OR (status = 'SENDING' AND updated_at <= ${staleBefore})
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
    /*
     * Sin `increment`: la cuota ya estaba agotada al reclamar y aquí no se
     * intentó ningún envío. Sumar otro dejaría la fila en seis intentos de
     * cinco.
     */
    async markExhausted(id: string, error: string) {
      await prisma.notification.update({
        where: { id },
        data: { status: 'FAILED', lastError: error },
      });
    },

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
