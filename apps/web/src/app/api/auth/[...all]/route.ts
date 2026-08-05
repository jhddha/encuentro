import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth';

/**
 * Endpoints de autenticación.
 *
 * Better Auth aplica su propio rate limit sobre `/two-factor/*` (3 peticiones
 * cada 10 s). El resto de límites de la aplicación se configuran en el reverse
 * proxy durante P14.
 */
export const { POST, GET } = toNextJsHandler(auth());
