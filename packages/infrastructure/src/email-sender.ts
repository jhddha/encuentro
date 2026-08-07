import type { EmailMessage, EmailSender } from '@encuentro/application';
import { createTransport, type Transporter } from 'nodemailer';

import type { PrismaClient } from './prisma.js';

/**
 * Envío de correo por SMTP — GOV-007.
 *
 * La configuración está partida a propósito y no por descuido:
 *
 *  - **Host, puerto, remitente y TLS viven en la base** (`smtp_settings`), con
 *    un índice único que impide una segunda fila. Son configuración que un
 *    administrador cambia desde `/admin/configuracion/correo` sin desplegar.
 *  - **La contraseña vive en el entorno.** Un secreto en base es un secreto en
 *    cada respaldo, en cada volcado y en cada pantalla de administración. La
 *    tabla ni siquiera tiene columna para ella.
 *
 * Verificado contra la documentación de nodemailer 9.0.4: `createTransport`
 * acepta `{ host, port, secure, auth }` y `sendMail` devuelve promesa.
 */

export interface SmtpCredentials {
  /** Contraseña SMTP, tomada del entorno. Nunca se persiste ni se registra. */
  readonly password: string;
}

interface SmtpSettingsRow {
  host: string;
  port: number;
  username: string | null;
  fromName: string;
  fromEmail: string;
  secure: boolean;
}

/**
 * Lee la configuración global de correo.
 *
 * Devuelve `null` si nadie la ha configurado todavía. No lanza: que el correo
 * no esté configurado es un estado legítimo del sistema recién instalado, y el
 * worker debe poder arrancar igual (GOV-008).
 */
export async function findSmtpSettings(prisma: PrismaClient): Promise<SmtpSettingsRow | null> {
  return await prisma.smtpSettings.findFirst({
    select: {
      host: true,
      port: true,
      username: true,
      fromName: true,
      fromEmail: true,
      secure: true,
    },
  });
}

export function createEmailSender(
  settings: SmtpSettingsRow,
  credentials: SmtpCredentials,
): EmailSender {
  const transporter: Transporter = createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    ...(settings.username === null || settings.username === ''
      ? {}
      : { auth: { user: settings.username, pass: credentials.password } }),
  });

  return {
    async send(message: EmailMessage): Promise<void> {
      await transporter.sendMail({
        from: { name: settings.fromName, address: settings.fromEmail },
        to: message.to,
        subject: message.subject,
        text: message.body,
      });
    },
  };
}
