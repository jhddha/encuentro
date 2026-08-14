/**
 * A qué base apunta realmente una cadena de conexión.
 *
 * Existe para una sola pregunta, y es una peligrosa: **¿estas dos URL llevan al
 * mismo sitio?** La hacen las dos suites que destruyen datos —integración hace
 * `TRUNCATE` de todo el esquema, el recorrido apaga un disparador de solo
 * anexado— y ahora también la restauración de respaldos, que sobrescribe la
 * base entera.
 *
 * La primera versión de esta comparación vivía en `tests/base-desechable.ts` y
 * comparaba las dos cadenas como texto. Una revisión la burló en ocho de nueve
 * intentos: basta escribir la misma base de otra forma —`127.0.0.1` en vez de
 * `localhost`, una barra final, un parámetro de más, el puerto explícito— para
 * que dos textos distintos apunten al mismo sitio. Comparar cadenas no protege
 * de nada; protege de las erratas.
 *
 * Se compara **servidor, puerto y nombre de base**, que es lo que decide a qué
 * datos se llega. Vive aquí, y no en `tests/`, porque los scripts de respaldo
 * necesitan exactamente la misma garantía: una copia habría sido la versión de
 * cadenas otra vez, escrita por quien no leyó la revisión.
 */

export interface PostgresTarget {
  readonly host: string;
  readonly port: string;
  readonly database: string;
}

/**
 * Interpreta una cadena de conexión.
 *
 * @param variable Nombre de la variable de entorno, para que el error diga cuál.
 */
export function postgresTarget(url: string, variable: string): PostgresTarget {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${variable} no es una URL de conexión válida.`);
  }

  const database = decodeURIComponent(parsed.pathname).replace(/^\/+/, '').replace(/\/+$/, '');

  if (database === '') {
    throw new Error(`${variable} no nombra ninguna base de datos.`);
  }

  return { host: normalizeHost(parsed.hostname), port: parsed.port || '5432', database };
}

/**
 * Todas las formas de decir «esta máquina» son la misma.
 *
 * `localhost` y `127.0.0.1` no se distinguen: lo que importa no es acertar el
 * nombre del servidor, es no acertarle a la base de trabajo.
 *
 * **Se pasa a minúsculas antes de comparar, y esa línea faltaba.** Para los
 * esquemas «especiales» —`http`, `https`, `file`— la URL de WHATWG normaliza el
 * servidor a minúsculas, pero `postgresql:` no es uno de ellos: su servidor es
 * opaco y llega tal cual se escribió. Así que `LOCALHOST` no casaba con
 * `localhost`, se saltaba el mapeo a `127.0.0.1`, y el guarda daba por distintas
 * dos cadenas que llevan exactamente a la misma base. Lo encontró la primera
 * prueba que se le escribió.
 */
function normalizeHost(hostname: string): string {
  const host = hostname.toLowerCase();

  // `[::1]` es como la URL entrega el bucle local en IPv6.
  return host === 'localhost' || host === '::1' || host === '[::1]' ? '127.0.0.1' : host;
}

export function sameTarget(a: PostgresTarget, b: PostgresTarget): boolean {
  return a.host === b.host && a.port === b.port && a.database === b.database;
}

/** `127.0.0.1:5432/encuentro`, para que el mensaje diga a qué base se refiere. */
export function describeTarget(target: PostgresTarget): string {
  return `${target.host}:${target.port}/${target.database}`;
}
