import { describeTarget, postgresTarget, sameTarget } from '@encuentro/infrastructure';

/**
 * Guarda común de las dos suites que destruyen datos.
 *
 * Las de integración hacen `TRUNCATE` de todo el esquema; el recorrido de
 * extremo a extremo apaga un disparador de solo anexado para borrar cargos.
 * Ninguna puede correr sobre la base en la que alguien trabaja, y el 11 de
 * agosto de 2026 una de ellas lo hizo y borró un recorrido manual completo.
 *
 * La comparación de destinos vivía aquí y ahora está en
 * `packages/infrastructure/src/postgres-target.ts`, con pruebas. Se movió
 * cuando la restauración de respaldos necesitó exactamente la misma garantía:
 * una segunda copia habría vuelto a ser la versión que compara cadenas, escrita
 * por quien no leyó la revisión que la tumbó. Al escribirle las primeras
 * pruebas apareció además un hueco que llevaba ahí desde el principio.
 */

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
    const destino = postgresTarget(url, variable);

    if (sameTarget(destino, postgresTarget(desarrollo, 'DATABASE_URL'))) {
      throw new Error(
        `${variable} apunta a la misma base que DATABASE_URL (${describeTarget(destino)}). ` +
          `${porQue}\nUse una distinta: \`${comoCrearla}\`.`,
      );
    }
  }

  return url;
}
