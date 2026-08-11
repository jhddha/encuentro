import 'dotenv/config';

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

/**
 * Crea la base del recorrido automatizado y le aplica las migraciones.
 *
 * El recorrido exige una base propia (`E2E_DATABASE_URL`). Dos motivos, los dos
 * duros: siembra catálogo que la limpieza no puede retirar —distinguir un canal
 * de cobro sembrado de uno puesto por una persona no se puede—, y para borrar
 * los cargos apaga un disparador de solo anexado. Ninguna de las dos cosas se
 * hace sobre una base donde alguien esté trabajando.
 *
 * `CREATE DATABASE` no admite transacción y Prisma no lo expone, así que se
 * ejecuta con `psql` dentro del contenedor de `docker-compose.yml`, que es de
 * donde sale la base de desarrollo.
 */

const NOMBRE = 'encuentro_e2e';

function urlDestino(): string {
  const configurada = process.env.E2E_DATABASE_URL;

  if (configurada !== undefined && configurada !== '') return configurada;

  const desarrollo = process.env.DATABASE_URL;

  if (desarrollo === undefined || desarrollo === '') {
    throw new Error('Falta DATABASE_URL en .env. Copie .env.example y levante `pnpm db:up`.');
  }

  const url = new URL(desarrollo);
  url.pathname = `/${NOMBRE}`;
  return url.toString();
}

function docker(argumentos: readonly string[]): string {
  return execFileSync('docker', ['compose', 'exec', '-T', 'postgres', ...argumentos], {
    encoding: 'utf8',
  });
}

const destino = urlDestino();
const base = new URL(destino).pathname.slice(1);
const usuario = new URL(destino).username;

if (base === new URL(process.env.DATABASE_URL ?? 'postgres:///x').pathname.slice(1)) {
  throw new Error(`«${base}» es la base de desarrollo. Elija otro nombre para el recorrido.`);
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
  docker(['psql', '-U', usuario, '-d', 'postgres', '-c', `CREATE DATABASE ${base} OWNER ${usuario}`]);
  console.log(`Creada la base ${base}.`);
}

// `migrate deploy` y no `migrate dev`: este último compara el esquema y puede
// proponer un reinicio. Aquí solo hay que aplicar lo que ya está escrito.
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

console.log(`\nListo. Añada a su .env:\n  E2E_DATABASE_URL=${destino}`);
