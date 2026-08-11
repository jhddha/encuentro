import 'server-only';

import { createAuth, enqueueNotification } from '@encuentro/infrastructure';

import { prisma } from './container';

/** Plantilla del correo de verificación (DEC-013). La siembra el seed. */
const PLANTILLA_VERIFICACION = 'AUTH_EMAIL_VERIFICATION';

/**
 * Instancia de autenticación del proceso web.
 *
 * Se reutiliza entre peticiones por el mismo motivo que el cliente Prisma: en
 * desarrollo Next recarga los módulos y crearía una instancia nueva en cada
 * cambio.
 *
 * **Consecuencia que cuesta un rato averiguar:** la instancia sobrevive a la
 * recarga en caliente, así que **editar este fichero no surte efecto hasta
 * reiniciar el servidor**. Ocurrió al cambiar `sendVerificationEmail`: el alta
 * seguía escribiendo en la consola con el código nuevo ya en disco, y desde
 * fuera parecía que el cambio no funcionaba.
 */
const globalForAuth = globalThis as unknown as {
  encuentroAuth?: ReturnType<typeof createAuth>;
};

export function auth() {
  globalForAuth.encuentroAuth ??= createAuth({
    prisma: prisma(),
    secret: requireEnv('SESSION_SECRET'),
    baseURL: requireEnv('APP_URL'),
    sendVerificationEmail: async ({ email, url }) => {
      /*
       * DEC-013 y GOV-008: el correo se **encola**, no se envía desde aquí. Una
       * caída de SMTP no puede revertir una cuenta recién creada, y el worker
       * reintenta con espera creciente hasta abandonar a los cinco intentos.
       *
       * El precio, y conviene saberlo: sin worker corriendo no sale ningún
       * correo. Las filas se quedan en `PENDING` y se ven en la tabla.
       */
      try {
        await enqueueNotification(prisma(), {
          templateCode: PLANTILLA_VERIFICACION,
          toEmail: email,
          variables: { url },
        });
      } catch (error) {
        /*
         * Si encolar falla —falta la plantilla, la base tropieza— la cuenta ya
         * está creada y no se deshace. Queda el enlace en el registro para no
         * dejar a nadie encerrado fuera, que es exactamente lo que hacía este
         * bloque cuando el envío todavía no existía.
         */
        console.error(
          `[verificación de correo] no se pudo encolar para ${email}: ${String(error)}`,
        );
        console.info(`[verificación de correo] enlace de respaldo: ${url}`);
      }
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
