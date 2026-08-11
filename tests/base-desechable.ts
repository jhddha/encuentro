/**
 * Guarda común de las dos suites que destruyen datos.
 *
 * Las de integración hacen `TRUNCATE` de todo el esquema; el recorrido de
 * extremo a extremo apaga un disparador de solo anexado para borrar cargos.
 * Ninguna puede correr sobre la base en la que alguien trabaja, y el 11 de
 * agosto de 2026 una de ellas lo hizo y borró un recorrido manual completo.
 *
 * La primera versión de esta guarda comparaba las dos cadenas de conexión. Una
 * revisión la burló en ocho de nueve intentos: basta escribir la misma base de
 * otra forma —`127.0.0.1` en vez de `localhost`, una barra final, un parámetro
 * de más, el puerto explícito— para que dos textos distintos apunten al mismo
 * sitio. Una comparación de cadenas no protege de nada; protege de las erratas.
 *
 * Ahora se comparan **servidor, puerto y nombre de base**, que es lo que decide
 * a qué datos se llega.
 */

interface Destino {
  readonly host: string;
  readonly puerto: string;
  readonly base: string;
}

function destinoDe(url: string, variable: string): Destino {
  let analizada: URL;

  try {
    analizada = new URL(url);
  } catch {
    throw new Error(`${variable} no es una URL de conexión válida.`);
  }

  const base = decodeURIComponent(analizada.pathname).replace(/^\/+/, '').replace(/\/+$/, '');

  if (base === '') {
    throw new Error(`${variable} no nombra ninguna base de datos.`);
  }

  return {
    // `localhost` y `127.0.0.1` son el mismo servidor en la práctica y no se
    // distinguen aquí: lo que importa es no acertarle a la base de trabajo.
    host: analizada.hostname === 'localhost' ? '127.0.0.1' : analizada.hostname.toLowerCase(),
    puerto: analizada.port === '' ? '5432' : analizada.port,
    base,
  };
}

function mismoDestino(a: Destino, b: Destino): boolean {
  return a.host === b.host && a.puerto === b.puerto && a.base === b.base;
}

/**
 * Devuelve la URL de la base desechable, o lanza explicando por qué hace falta.
 *
 * @param variable  Nombre de la variable de entorno que la nombra.
 * @param comoCrearla  Comando que la crea, para que el error sea accionable.
 * @param porQue  Qué destruye esta suite. Va en el mensaje: quien lo lea tiene
 *   que entender el riesgo sin ir a buscar la documentación.
 */
export function baseDesechable(variable: string, comoCrearla: string, porQue: string): string {
  const url = process.env[variable];

  if (url === undefined || url === '') {
    throw new Error(
      `Falta ${variable}. ${porQue}\n` +
        `Cree una base propia con \`${comoCrearla}\` y añádala a .env (ver .env.example).`,
    );
  }

  const desarrollo = process.env.DATABASE_URL;

  if (desarrollo !== undefined && desarrollo !== '') {
    const destino = destinoDe(url, variable);

    if (mismoDestino(destino, destinoDe(desarrollo, 'DATABASE_URL'))) {
      throw new Error(
        `${variable} apunta a la misma base que DATABASE_URL (${destino.host}:${destino.puerto}/${destino.base}). ` +
          `${porQue}\nUse una distinta: \`${comoCrearla}\`.`,
      );
    }
  }

  return url;
}
