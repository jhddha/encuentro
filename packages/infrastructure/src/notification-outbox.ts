import type { PrismaClient } from './prisma.js';

/**
 * Encolado de correo — GOV-008, ADR-007.
 *
 * Escribir en la bandeja de salida y no enviar desde la petición es una
 * decisión de arquitectura, no una comodidad: un SMTP caído no puede revertir
 * una cuenta recién creada ni un pago ya aprobado. El worker drena la cola,
 * reintenta con espera creciente y abandona a los cinco intentos (NTF-009).
 *
 * El precio es que **sin worker corriendo no sale ningún correo**. Es visible:
 * las filas se quedan en `PENDING` y se ven en la tabla.
 */

export interface EnqueueNotificationInput {
  /** Código de la plantilla; se usa la versión activa más alta. */
  readonly templateCode: string;
  readonly toEmail: string;
  readonly variables: Readonly<Record<string, string>>;
  /**
   * Gestión a la que pertenece el envío, si pertenece a alguna.
   *
   * La verificación de correo y el restablecimiento de contraseña son de la
   * cuenta, no de una gestión, y por eso la columna admite nulo.
   */
  readonly eventId?: string | null;
}

export class NotificationTemplateMissing extends Error {
  constructor(code: string) {
    super(`No existe ninguna plantilla activa con el código ${code}.`);
    this.name = 'NotificationTemplateMissing';
  }
}

/**
 * Deja un correo listo para que el worker lo envíe.
 *
 * Las variables se resuelven **ahora** y se guardan resueltas: si el dato de
 * origen cambia entre el encolado y el envío, el correo dice lo que decía
 * cuando se decidió enviarlo, no lo que diga la base al despacharlo.
 */
export async function enqueueNotification(
  prisma: PrismaClient,
  input: EnqueueNotificationInput,
): Promise<string> {
  const template = await prisma.notificationTemplate.findFirst({
    where: { code: input.templateCode, active: true },
    orderBy: { version: 'desc' },
    select: { id: true },
  });

  if (template === null) {
    throw new NotificationTemplateMissing(input.templateCode);
  }

  const notification = await prisma.notification.create({
    data: {
      templateId: template.id,
      toEmail: input.toEmail,
      variables: input.variables,
      eventId: input.eventId ?? null,
    },
    select: { id: true },
  });

  return notification.id;
}
