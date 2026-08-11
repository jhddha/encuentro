import 'dotenv/config';

import { baseDesechable } from '../base-desechable';

/**
 * Preparación de las pruebas de integración.
 *
 * `resetDatabase` hace `TRUNCATE` de **todas** las tablas del esquema entre
 * pruebas. Hasta el 11 de agosto de 2026 lo hacía sobre `DATABASE_URL`, es
 * decir sobre la base de desarrollo, y ese día se llevó por delante los datos
 * de un recorrido manual entero: dos comprobantes, la inscripción y su rastro
 * de auditoría. No hubo aviso porque no había ninguno que dar: el comando
 * declarado en el gate hacía exactamente lo que estaba escrito.
 *
 * Desde entonces la suite exige una base propia. No es una precaución
 * exagerada: una herramienta que vacía el esquema no puede apuntar por omisión
 * a la base en la que alguien trabaja, y «acuérdate de no ejecutarla» no es un
 * mecanismo.
 *
 * `pnpm db:test` la crea y le aplica las migraciones.
 */

const url = baseDesechable(
  'TEST_DATABASE_URL',
  'pnpm db:test',
  'Estas pruebas hacen TRUNCATE de todo el esquema entre pruebas: no pueden correr sobre una ' +
    'base de trabajo.',
);

/*
 * Los ayudantes y los repositorios leen `DATABASE_URL`. Se sustituye aquí, en
 * el proceso de las pruebas, en vez de cambiar cada punto de construcción: así
 * ninguna ruta de código puede escaparse por descuido a la base equivocada.
 */
process.env.DATABASE_URL = url;
