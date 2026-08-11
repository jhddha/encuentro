import 'server-only';

/**
 * Límite de ritmo para la verificación pública de comprobante — PAY-031.
 *
 * Es la **única** superficie del sistema accesible sin sesión, y no tenía
 * ninguna cuota. El `Caddyfile` decía limitarla y no contenía ninguna directiva
 * que lo hiciera: `caddy:2-alpine` no trae limitación de ritmo de serie.
 *
 * **Qué protege y qué no.** El token son 32 bytes aleatorios y no se adivina por
 * fuerza bruta; el riesgo real es que cada petición fuerza una consulta a la
 * base, y un solo cliente puede saturarla durante el evento, que es cuando más
 * caro sale. Por eso el límite se aplica **antes de consultar**, no antes de
 * renderizar: lo que se protege es Postgres, no el proceso web.
 *
 * **Es por proceso y en memoria**, y conviene saber lo que eso significa:
 *
 *  - Se reinicia con cada despliegue. Aceptable: no guarda nada que importe.
 *  - Con varias réplicas el límite efectivo se multiplica por su número. Hoy el
 *    despliegue de DEC-001 es un solo contenedor web; si algún día son varios,
 *    esto hay que mover a Redis, que el worker ya usa.
 *
 * No se eligió Redis ahora porque `apps/web` no lo usa para nada más, y añadir
 * una dependencia de infraestructura a la web para un contador es peor negocio
 * que un límite aproximado y honesto.
 */

/** Peticiones permitidas por ventana y origen. */
const MAX_REQUESTS = 30;

/** Ventana fija de un minuto. */
const WINDOW_MS = 60_000;

/**
 * Tope de orígenes distintos en memoria.
 *
 * Sin él, un atacante que varíe la IP haría crecer el mapa sin límite: el
 * contador antifuga se convertiría en la fuga. Al llegar al tope se vacía
 * entero, que degrada el límite pero nunca la memoria.
 */
const MAX_TRACKED = 10_000;

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Estado compartido entre peticiones.
 *
 * En `globalThis` por lo mismo que el cliente de Prisma: en desarrollo Next
 * recarga los módulos y cada recarga crearía un contador nuevo.
 */
const globalForLimit = globalThis as unknown as { encuentroRateLimit?: Map<string, Bucket> };
const buckets = (globalForLimit.encuentroRateLimit ??= new Map<string, Bucket>());

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Segundos hasta que la ventana se reinicia. Para `Retry-After`. */
  readonly retryAfterSeconds: number;
}

/**
 * Ventana fija, no deslizante.
 *
 * Una ventana fija permite el doble del límite justo en el cambio de ventana.
 * Se acepta: aquí no se protege un secreto sino un recurso, y 60 consultas en
 * dos segundos no tumban nada. Una ventana deslizante costaría guardar marcas
 * de tiempo por origen, y ese coste sí crece con el abuso.
 */
export function checkRateLimit(key: string, now: number = Date.now()): RateLimitDecision {
  if (buckets.size > MAX_TRACKED) buckets.clear();

  const bucket = buckets.get(key);

  if (bucket === undefined || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;

  if (bucket.count > MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Origen de la petición, para contar por cliente.
 *
 * `x-real-ip` lo pone el proxy; `x-forwarded-for` puede traer una cadena y solo
 * el primer valor es el cliente. Sin ninguno de los dos —desarrollo local— se
 * cuenta todo junto bajo la misma clave, que es lo estricto: en local no hay
 * proxy y no hay a quién distinguir.
 *
 * **Ambas cabeceras son falsificables si el proxy no las reescribe.** El
 * `Caddyfile` las fija en el bloque de esta ruta precisamente por eso.
 */
export function clientKey(headers: Headers): string {
  const real = headers.get('x-real-ip');
  if (real !== null && real.trim() !== '') return real.trim();

  const forwarded = headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();

  return first !== undefined && first !== '' ? first : 'sin-origen';
}
