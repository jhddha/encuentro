/**
 * Prueba de carga contra los umbrales del contrato — NFR-002 y NFR-003.
 *
 * No es una medición suelta: compara contra los umbrales declarados y termina
 * con código distinto de cero si alguno se incumple. Así puede colgarse de un
 * gate y no depender de que alguien mire los números.
 *
 * Se evalúa el **p97.5**, no el p95 que piden los requisitos. Es un percentil
 * más estricto: si pasa el 97.5, el 95 pasa por definición. Se usa porque es lo
 * que autocannon reporta directamente, y aproximar el p95 interpolando sería
 * introducir un número que nadie midió.
 *
 * Uso:
 *   pnpm exec tsx scripts/load-test.mts [http://localhost:3100] [--connections 50] [--duration 15]
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';

/** Subconjunto del informe de autocannon que este script consume. */
interface AutocannonReport {
  readonly latency: { readonly p50: number; readonly p97_5: number };
  readonly requests: { readonly average: number };
  readonly non2xx: number;
  readonly errors: number;
}

type Clase = 'lectura' | 'mutacion' | 'escaner';

/** NFR-002 y NFR-003. Los umbrales viven aquí una sola vez. */
const UMBRALES: Readonly<Record<Clase, number>> = {
  lectura: 500,
  mutacion: 900,
  escaner: 800,
};

/**
 * Rutas medibles sin autenticación.
 *
 * Las mutaciones y el escáner exigen sesión y datos sembrados, así que este
 * script no las cubre todavía. Se declara al final de la ejecución en vez de
 * omitirlo: un gate que mide la mitad y no lo dice es peor que no tenerlo.
 */
const OBJETIVOS: readonly { readonly ruta: string; readonly clase: Clase }[] = [
  { ruta: '/api/health', clase: 'lectura' },
  { ruta: '/', clase: 'lectura' },
  { ruta: '/e/ENC2026', clase: 'lectura' },
  { ruta: '/e/ENC2026/inscripcion', clase: 'lectura' },
];

function argumento(nombre: string, porDefecto: number): number {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i === -1) return porDefecto;
  const valor = Number(process.argv[i + 1]);
  return Number.isFinite(valor) ? valor : porDefecto;
}

const base = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:3100';
const conexiones = argumento('connections', 50);
const duracion = argumento('duration', 15);

function medir(url: string): AutocannonReport {
  const resultado = spawnSync(
    'npx',
    ['-y', 'autocannon@8', '-c', String(conexiones), '-d', String(duracion), '-j', url],
    { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 32 * 1024 * 1024 },
  );

  if (resultado.status !== 0) {
    throw new Error(`autocannon falló sobre ${url}: ${resultado.stderr.slice(0, 300)}`);
  }

  return JSON.parse(resultado.stdout) as AutocannonReport;
}

console.log(`Carga contra ${base} — ${String(conexiones)} conexiones, ${String(duracion)}s por ruta\n`);
console.log(
  'ruta'.padEnd(26),
  'p50'.padStart(7),
  'p97.5'.padStart(8),
  'umbral'.padStart(8),
  'req/s'.padStart(7),
  '  veredicto',
);

let fallos = 0;

for (const objetivo of OBJETIVOS) {
  const informe = medir(base + objetivo.ruta);
  const umbral = UMBRALES[objetivo.clase];
  const p975 = informe.latency.p97_5;

  // Un 5xx invalida la medición: responder rápido con un error no es cumplir.
  const roto = informe.non2xx > 0 || informe.errors > 0;
  const excede = p975 > umbral;
  const ok = !roto && !excede;
  if (!ok) fallos += 1;

  const veredicto = ok
    ? '  OK'
    : roto
      ? `  FALLO (${String(informe.non2xx)} no-2xx, ${String(informe.errors)} errores)`
      : '  FALLO por latencia';

  console.log(
    objetivo.ruta.padEnd(26),
    `${String(informe.latency.p50)}ms`.padStart(7),
    `${String(p975)}ms`.padStart(8),
    `${String(umbral)}ms`.padStart(8),
    String(Math.round(informe.requests.average)).padStart(7),
    veredicto,
  );
}

console.log('\nNo cubierto por este script:');
console.log('  NFR-002 mutaciones (900 ms): exige sesión autenticada y datos sembrados');
console.log('  NFR-003 escáner online (800 ms): exige sesión y estación registrada');
console.log('  NFR-003 guardado local offline (300 ms): es cliente, no servidor');

if (fallos > 0) {
  console.error(`\n${String(fallos)} ruta(s) incumplen su umbral.`);
  process.exit(1);
}

console.log('\nTodas las rutas medidas cumplen su umbral.');
