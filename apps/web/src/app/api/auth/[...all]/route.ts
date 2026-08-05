import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth';

/**
 * Endpoints de autenticación.
 *
 * El handler se construye **por petición**, no al cargar el módulo. Hacerlo en
 * tiempo de módulo obligaba a que `SESSION_SECRET` existiera durante `next
 * build`, y eso significa meter secretos de producción en la imagen para poder
 * compilarla. Los secretos son del entorno de ejecución, no del artefacto.
 *
 * Better Auth aplica su propio rate limit sobre `/two-factor/*` (3 peticiones
 * cada 10 s). El resto de límites se configuran en el reverse proxy (P14).
 */
export function GET(request: Request): Promise<Response> {
  return toNextJsHandler(auth()).GET(request);
}

export function POST(request: Request): Promise<Response> {
  return toNextJsHandler(auth()).POST(request);
}
