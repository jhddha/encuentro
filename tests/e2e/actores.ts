import { baseDesechable } from '../base-desechable';

/**
 * Personajes del recorrido automatizado y dónde vive su sesión.
 *
 * Tres y no dos. El coste marginal del tercero es una fila en
 * `role_assignments`, y desbloquea las dos afirmaciones negativas más caras:
 * que TESORERIA **no** pueda leer la auditoría y que ADMIN_MASTER **no** pueda
 * revisar comprobantes. Sin ellas, «el permiso se comprueba» y «el permiso está
 * escrito en un comentario» se ven igual desde fuera.
 */

/**
 * Sufijo de la corrida.
 *
 * Cada ejecución crea cuentas nuevas y la limpieza borra por este sufijo. Así
 * dos corridas no colisionan y ninguna necesita vaciar tablas: `resetDatabase`
 * de las pruebas de integración hace TRUNCATE de todo el esquema y aquí eso se
 * llevaría por delante los datos de quien esté trabajando en local.
 */
export const RUN = process.env.E2E_RUN_ID ?? Date.now().toString(36);

/** Veintinueve caracteres, sobre el mínimo de doce de `authOptions`. */
export const PASSWORD = 'contrasena-de-prueba-e2e-larga';

export const BASE = 'http://127.0.0.1:3100';

export const EVENTO = 'ENC2026';

/** Dominio reservado por RFC 2606: ningún correo de estos puede salir de aquí. */
const DOMINIO = 'encuentro.test';

export interface Actor {
  readonly clave: string;
  readonly correo: string;
  readonly nombre: string;
  /** `null` = peregrino: sin asignaciones, y por tanto sin segundo factor (DEC-014). */
  readonly rol: string | null;
  readonly scope: 'GLOBAL' | 'EVENT' | null;
}

export const ACTORES = {
  peregrino: {
    clave: 'peregrino',
    correo: `e2e-peregrino-${RUN}@${DOMINIO}`,
    nombre: 'Peregrino de prueba',
    rol: null,
    scope: null,
  },
  tesoreria: {
    clave: 'tesoreria',
    correo: `e2e-tesoreria-${RUN}@${DOMINIO}`,
    nombre: 'Tesorería de prueba',
    rol: 'TESORERIA',
    scope: 'EVENT',
  },
  admin: {
    clave: 'admin',
    correo: `e2e-admin-${RUN}@${DOMINIO}`,
    nombre: 'Administración de prueba',
    rol: 'ADMIN_MASTER',
    scope: 'GLOBAL',
  },
} as const satisfies Record<string, Actor>;

export type ClaveActor = keyof typeof ACTORES;

/**
 * Dónde vive la sesión de cada personaje.
 *
 * **Fuera de `test-results/`**: Playwright vacía ese directorio al arrancar
 * cualquier corrida, así que ejecutar un solo fichero con `--grep` borraba las
 * sesiones sembradas y las pruebas se quedaban sin cookie sin decir por qué.
 */
export function estado(clave: ClaveActor): string {
  return `${DIRECTORIO_SESIONES}/${clave}.json`;
}

/** Ignorado por git; ver `.gitignore`. */
export const DIRECTORIO_SESIONES = '.sesiones-e2e';

/**
 * Base de datos del recorrido: **propia y obligatoria**.
 *
 * No cae a `DATABASE_URL` a propósito. La siembra deja catálogo —gestión,
 * paquete, versión de precio, canal de cobro, roles— y la limpieza no lo
 * retira: solo borra las cuentas de la corrida, porque distinguir «este canal
 * de cobro lo puso el recorrido» de «lo puso una persona» no se puede. Cayendo
 * a la base de desarrollo, cada ejecución la ensucia un poco más.
 *
 * Y hay una razón más dura: la limpieza tiene que apagar un disparador de solo
 * anexado para borrar los cargos. Esa llave no se usa sobre una base donde
 * alguien esté trabajando.
 *
 * `pnpm db:e2e` la crea y le aplica las migraciones.
 */
export function urlBaseDeDatos(): string {
  return baseDesechable(
    'E2E_DATABASE_URL',
    'pnpm db:e2e',
    'El recorrido siembra catálogo que su limpieza no retira y apaga un disparador de solo ' +
      'anexado para borrar los cargos: no puede correr sobre una base de trabajo.',
  );
}
