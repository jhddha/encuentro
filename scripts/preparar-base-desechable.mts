import 'dotenv/config';

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

/**
 * Crea una base desechable y le aplica las migraciones.
 *
 * Dos suites vacían lo que tocan y por eso ninguna puede apuntar a la base de
 * desarrollo:
 *
 *  - las pruebas de integración hacen `TRUNCATE` de todo el esquema entre
 *    pruebas (`TEST_DATABASE_URL`);
 *  - el recorrido de extremo a extremo siembra catálogo que su limpieza no
 *    puede retirar, y apaga un disparador de solo anexado para borrar los
 *    cargos (`E2E_DATABASE_URL`).
 *
 * El 11 de agosto de 2026 la primera se ejecutó contra la base de desarrollo y
 * borró un recorrido manual completo. Este script existe para que la separación
 * sea un paso de un minuto y no una nota en un documento.
 *
 * Uso: `pnpm db:test` o `pnpm db:e2e`.
 *
 * `CREATE DATABASE` no admite transacción y Prisma no lo expone, así que se
 * ejecuta con `psql` dentro del contenedor de `docker-compose.yml`. En CI, donde
 * Postgres es un servicio y no hay `docker compose`, la base la crea el propio
 * workflow.
 */

const SUFIJOS: Readonly<Record<string, { sufijo: string; variable: string }>> = {
  test: { sufijo: '_test', variable: 'TEST_DATABASE_URL' },
  e2e: { sufijo: '_e2e', variable: 'E2E_DATABASE_URL' },
};

const modo = process.argv[2];
const eleccion = modo === undefined ? undefined : SUFIJOS[modo];

if (eleccion === undefined) {
  throw new Error(`Uso: tsx scripts/preparar-base-desechable.mts <${Object.keys(SUFIJOS).join('|')}>`);
}

const desarrollo = process.env.DATABASE_URL;

if (desarrollo === undefined || desarrollo === '') {
  throw new Error('Falta DATABASE_URL en .env. Copie .env.example y levante `pnpm db:up`.');
}

function urlDestino(): string {
  const configurada = process.env[eleccion.variable];

  if (configurada !== undefined && configurada !== '') return configurada;

  const url = new URL(desarrollo);
  url.pathname = `${url.pathname}${eleccion.sufijo}`;
  return url.toString();
}

const destino = urlDestino();
const base = new URL(destino).pathname.slice(1);
const usuario = new URL(destino).username;

if (base === new URL(desarrollo).pathname.slice(1)) {
  throw new Error(
    `«${base}» es la base de desarrollo, y esta suite la vaciaría. Elija otro nombre.`,
  );
}

function docker(argumentos: readonly string[]): string {
  return execFileSync('docker', ['compose', 'exec', '-T', 'postgres', ...argumentos], {
    encoding: 'utf8',
  });
}

const existe = docker([
  'psql',
  '-U',
  usuario,
  '-d',
  'postgres',
  '-tAc',
  `SELECT 1 FROM pg_database WHERE datname='${base}'`,
]).trim();

if (existe === '1') {
  console.log(`La base ${base} ya existe.`);
} else {
  docker([
    'psql',
    '-U',
    usuario,
    '-d',
    'postgres',
    '-c',
    `CREATE DATABASE ${base} OWNER ${usuario}`,
  ]);
  console.log(`Creada la base ${base}.`);
}

/*
 * Se invoca la CLI de Prisma con el propio Node, no con `pnpm exec`.
 *
 * En Windows los lanzadores son `.cmd`, y Node ≥20 se niega a ejecutarlos sin
 * `shell: true` (EINVAL); con shell, avisa de que los argumentos se concatenan
 * sin escapar (DEP0190). Resolver el JavaScript y ejecutarlo directamente evita
 * las dos cosas y funciona igual en los tres sistemas.
 */
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');

execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
  env: { ...process.env, DATABASE_URL: destino },
  stdio: 'inherit',
});

console.log(`\nListo. Añada a su .env:\n  ${eleccion.variable}=${destino}`);
