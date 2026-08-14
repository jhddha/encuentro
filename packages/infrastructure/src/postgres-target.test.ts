import { describe, expect, it } from 'vitest';

import { describeTarget, postgresTarget, sameTarget } from './postgres-target.js';

/**
 * El guarda que impide destruir la base de trabajo, con pruebas por fin.
 *
 * Vivía sin ninguna. El 11 de agosto de 2026 una suite corrió sobre la base de
 * desarrollo y borró un recorrido manual completo; la primera versión del
 * guarda comparaba cadenas y una revisión la burló en ocho de nueve intentos.
 * Se corrigió y **la corrección tampoco tuvo pruebas**, así que nada impedía
 * que volviera a degradarse.
 *
 * Los casos de aquí abajo son literalmente esos ocho intentos.
 */

const TRABAJO = 'postgresql://encuentro:encuentro@localhost:5432/encuentro';

function apuntanAlMismoSitio(otra: string): boolean {
  return sameTarget(postgresTarget(TRABAJO, 'DATABASE_URL'), postgresTarget(otra, 'OTRA'));
}

describe('dos cadenas que llevan a la misma base', () => {
  it.each([
    ['idéntica', 'postgresql://encuentro:encuentro@localhost:5432/encuentro'],
    ['por dirección numérica', 'postgresql://encuentro:encuentro@127.0.0.1:5432/encuentro'],
    ['sin puerto explícito', 'postgresql://encuentro:encuentro@localhost/encuentro'],
    ['con barra final', 'postgresql://encuentro:encuentro@localhost:5432/encuentro/'],
    [
      'con parámetro de más',
      'postgresql://encuentro:encuentro@localhost:5432/encuentro?schema=public',
    ],
    /*
     * `postgresql:` no es un esquema «especial» para la URL de WHATWG, así que
     * su servidor llega tal cual se escribió: sin normalizar a minúsculas, esta
     * cadena y la de trabajo parecían destinos distintos.
     */
    ['con el servidor en mayúsculas', 'postgresql://encuentro:encuentro@LOCALHOST:5432/encuentro'],
    ['por bucle local en IPv6', 'postgresql://encuentro:encuentro@[::1]:5432/encuentro'],
    ['con otro usuario', 'postgresql://otro:clave@localhost:5432/encuentro'],
    ['con esquema postgres://', 'postgres://encuentro:encuentro@localhost:5432/encuentro'],
  ])('se reconoce %s', (_caso, otra) => {
    expect(apuntanAlMismoSitio(otra)).toBe(true);
  });
});

describe('dos cadenas que llevan a bases distintas', () => {
  it.each([
    ['otro nombre de base', 'postgresql://encuentro:encuentro@localhost:5432/encuentro_test'],
    ['otro puerto', 'postgresql://encuentro:encuentro@localhost:5433/encuentro'],
    ['otro servidor', 'postgresql://encuentro:encuentro@db.interno:5432/encuentro'],
    ['un prefijo que no es la misma base', 'postgresql://e:e@localhost:5432/encuentro2'],
  ])('se distingue %s', (_caso, otra) => {
    expect(apuntanAlMismoSitio(otra)).toBe(false);
  });
});

describe('cadenas que no sirven', () => {
  it('una URL rota se rechaza nombrando la variable', () => {
    expect(() => postgresTarget('esto no es una url', 'DATABASE_URL')).toThrow(/DATABASE_URL/);
  });

  /*
   * Sin nombre de base, `sameTarget` compararía cadenas vacías y daría iguales
   * dos destinos que no lo son. Se corta antes en vez de decidir a ciegas.
   */
  it('una cadena sin base de datos se rechaza', () => {
    expect(() => postgresTarget('postgresql://u:c@localhost:5432', 'OTRA')).toThrow(
      /no nombra ninguna base/,
    );
    expect(() => postgresTarget('postgresql://u:c@localhost:5432/', 'OTRA')).toThrow(
      /no nombra ninguna base/,
    );
  });
});

describe('describeTarget', () => {
  it('nombra el destino sin revelar credenciales', () => {
    const texto = describeTarget(postgresTarget(TRABAJO, 'DATABASE_URL'));

    expect(texto).toBe('127.0.0.1:5432/encuentro');
    // El mensaje acaba en un log o en una consola compartida.
    expect(texto).not.toContain('encuentro:encuentro');
  });
});

describe('la base de ensayo de la restauración', () => {
  /*
   * `restore-drill.sh` crea una base `encuentro_drill_<sello>` y restaura ahí.
   * El nombre se parece al de trabajo y por eso conviene dejar comprobado que
   * el guarda los distingue: si no lo hiciera, un ensayo podría apuntar a la
   * base real y `pg_restore --clean` la vaciaría antes de recrearla.
   */
  it('no se confunde con la base de trabajo', () => {
    expect(
      apuntanAlMismoSitio('postgresql://e:e@localhost:5432/encuentro_drill_20261103120000'),
    ).toBe(false);
  });
});
