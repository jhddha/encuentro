import type { AuditEntry, AuditPort } from '@encuentro/application';

import type { PrismaClient } from './prisma.js';

/**
 * Claves cuyo valor nunca debe llegar al registro de auditoría.
 *
 * Regla 03-security-rbac: PII y secretos se redactan. La auditoría registra
 * **qué cambió**, no el dato personal en sí; para eso ya está la tabla de
 * origen, con su propio control de acceso.
 */
const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'secret',
  'apikey',
  'authorization',
  'cookie',
  'email',
  'phone',
  'documentnumber',
  'nationalid',
  'address',
  'payername',
  'bankreference',
  'accountnumber',
]);

const REDACTED = '[redactado]';

/**
 * Redacta recursivamente las claves sensibles.
 *
 * Trabaja sobre la forma del objeto, no sobre una lista de rutas concretas, de
 * modo que un campo anidado nuevo con nombre sensible queda cubierto sin
 * cambiar este código.
 */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
        key,
        REDACTED_KEYS.has(key.toLowerCase()) ? REDACTED : redact(inner),
      ]),
    );
  }

  return value;
}

export function createAuditPort(prisma: PrismaClient): AuditPort {
  return {
    async record(entry: AuditEntry): Promise<void> {
      await prisma.auditLog.create({
        data: {
          ...(entry.eventId === undefined ? {} : { eventId: entry.eventId }),
          actorId: entry.actorId,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          ...(entry.reason === undefined ? {} : { reason: entry.reason }),
          ...(entry.before === undefined ? {} : { beforeRedacted: redact(entry.before) as object }),
          ...(entry.after === undefined ? {} : { afterRedacted: redact(entry.after) as object }),
          ...(entry.correlationId === undefined ? {} : { correlationId: entry.correlationId }),
        },
      });
    },
  };
}
