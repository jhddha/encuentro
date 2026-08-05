import { loadEnv } from '@encuentro/config';
import { systemClock } from '@encuentro/infrastructure';
import { Redis } from 'ioredis';
import pino from 'pino';

/**
 * Proceso worker.
 *
 * Corre separado de `apps/web` (DEC-001). Por ahora solo valida el entorno,
 * abre la conexión a Redis y apaga limpio. Las colas BullMQ concretas
 * (notificaciones, exportaciones, sincronización offline) se añaden en las
 * fases que las requieren; crearlas aquí sin requisito asociado violaría la
 * regla 01-no-guessing.
 */

const env = loadEnv();

const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  // GOV/seguridad: los logs no deben exponer PII ni secretos (regla 03-security-rbac).
  redact: {
    paths: ['password', 'token', 'secret', '*.password', '*.token', '*.secret'],
    censor: '[redacted]',
  },
});

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

connection.on('error', (error: Error) => {
  logger.error({ err: error }, 'fallo de conexión con Redis');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'apagando worker');
  await connection.quit();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

logger.info({ startedAt: systemClock.now().toISOString() }, 'worker ENCUENTRO iniciado');
