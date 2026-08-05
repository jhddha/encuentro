import 'server-only';

import { createAuth } from '@encuentro/infrastructure';

import { prisma } from './container';

/**
 * Instancia de autenticación del proceso web.
 *
 * Se reutiliza entre peticiones por el mismo motivo que el cliente Prisma: en
 * desarrollo Next recarga los módulos y crearía una instancia nueva en cada
 * cambio.
 */
const globalForAuth = globalThis as unknown as {
  encuentroAuth?: ReturnType<typeof createAuth>;
};

export function auth() {
  globalForAuth.encuentroAuth ??= createAuth({
    prisma: prisma(),
    secret: requireEnv('SESSION_SECRET'),
    baseURL: requireEnv('APP_URL'),
    sendVerificationEmail: ({ email, url }) => {
      /*
       * DEC-013 y GOV-008: el envío real pertenece al worker (P13), vía outbox.
       * Hasta entonces el enlace se registra en el log del servidor para poder
       * completar el flujo en desarrollo.
       *
       * No se envía correo desde la petición a propósito: una caída de SMTP no
       * puede revertir la creación de la cuenta.
       */
      console.info(`[verificación de correo] ${email}: ${url}`);
      return Promise.resolve();
    },
  });

  return globalForAuth.encuentroAuth;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}
