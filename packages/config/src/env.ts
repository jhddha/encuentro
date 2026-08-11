import { z } from 'zod';

/**
 * Esquema de entorno. Refleja `.env.example` en la raíz del repositorio.
 * Toda variable nueva debe añadirse aquí antes de usarse en código.
 */
const placeholders = new Set(['change-me', 'change-me-too', '']);

const secret = (label: string) =>
  z
    .string()
    .min(32, `${label} debe tener al menos 32 caracteres`)
    .refine((value) => !placeholders.has(value), {
      message: `${label} conserva el valor de ejemplo; genere uno real`,
    });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url(),

  DATABASE_URL: z.string().startsWith('postgresql://'),
  REDIS_URL: z.string().startsWith('redis://'),

  OBJECT_STORAGE_ENDPOINT: z.url(),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),

  /**
   * Puerto del healthcheck del worker.
   *
   * Solo lo usa `apps/worker`. Con un valor por defecto porque no es un secreto
   * ni una decisión de despliegue: quien necesite cambiarlo lo hará, y exigirlo
   * obligaría a declararlo también en la web, que no lo usa.
   */
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().max(65535).default(3001),

  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),

  RECEIPT_VERIFICATION_SECRET: secret('RECEIPT_VERIFICATION_SECRET'),
  SESSION_SECRET: secret('SESSION_SECRET'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida el entorno y falla de inmediato si algo falta.
 *
 * No imprime el valor de las variables: el mensaje de error solo nombra la
 * variable afectada, para no filtrar secretos en logs (regla 03-security-rbac).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${detail}`);
  }

  return parsed.data;
}
