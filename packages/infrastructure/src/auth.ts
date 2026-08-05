import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { twoFactor } from 'better-auth/plugins';

import type { PrismaClient } from './prisma.js';

/**
 * Autenticación — DEC-016, ADR-010.
 *
 * Better Auth resuelve **identidad y sesión**. La **autorización sigue en el
 * dominio**: `packages/domain/src/rbac.ts` es la única autoridad sobre permisos
 * y scopes, y nada de eso se delega aquí. Una vulnerabilidad en la librería
 * compromete la sesión, no el modelo de permisos.
 */
export interface AuthDeps {
  readonly prisma: PrismaClient;
  readonly secret: string;
  readonly baseURL: string;
  /**
   * Envío del correo de verificación.
   *
   * DEC-013 y GOV-008: lo hace el worker. Una caída de SMTP no puede revertir
   * la creación de la cuenta, así que quien implemente esto debe encolar, no
   * enviar de forma síncrona.
   */
  readonly sendVerificationEmail: (input: {
    readonly email: string;
    readonly url: string;
  }) => Promise<void>;
}

export function createAuth(deps: AuthDeps) {
  return betterAuth({
    appName: 'Encuentro',
    secret: deps.secret,
    baseURL: deps.baseURL,

    database: prismaAdapter(deps.prisma, { provider: 'postgresql' }),

    // El modelo de identidad es el de P03: `users` con `display_name`. Better
    // Auth se acopla a él en vez de crear una tabla de usuarios paralela.
    user: {
      modelName: 'user',
      fields: { name: 'displayName' },
    },

    emailAndPassword: {
      enabled: true,
      // DEC-013: sin correo verificado no se inicia sesión.
      requireEmailVerification: true,
      minPasswordLength: 12,
    },

    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: ({ user, url }) => {
        // Sin `await` a propósito: esperar al envío haría que el tiempo de
        // respuesta revelara si la dirección existe.
        void deps.sendVerificationEmail({ email: user.email, url });
        return Promise.resolve();
      },
    },

    session: {
      // Persistida en base (tabla `sessions`), de modo que revocar sea borrar
      // una fila y no esperar a que caduque una cookie.
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 15,
    },

    advanced: {
      cookiePrefix: 'encuentro',
      useSecureCookies: process.env.NODE_ENV === 'production',
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
      },
      database: {
        // Better Auth genera por defecto identificadores alfanuméricos de 32
        // caracteres, que Postgres rechaza en una columna `uuid`. El resto del
        // esquema usa UUID (events, audit_logs, role_assignments), así que se
        // alinea la generación en vez de degradar esas columnas a texto.
        generateId: () => crypto.randomUUID(),
      },
    },

    plugins: [
      twoFactor({
        issuer: 'Encuentro',
        // DEC-014: los códigos de recuperación se guardan cifrados, no en claro.
        backupCodeOptions: { storeBackupCodes: 'encrypted' },
        accountLockout: {
          enabled: true,
          maxFailedAttempts: 10,
          durationSeconds: 900,
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
