import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Las rutas implementadas deben ser exactamente las del contrato: ni una de
 * más, ni una de menos (prompt P02, «rutas exactas de contracts/routes.json»).
 *
 * Vive en `@encuentro/config` y no en `apps/web` porque el paquete web usa
 * resolución Bundler y no participa del `tsc --build` de la raíz.
 */
const repoRoot = new URL('../../../', import.meta.url);
const appDir = fileURLToPath(new URL('apps/web/src/app/', repoRoot));

const contractRoutes = (
  JSON.parse(readFileSync(fileURLToPath(new URL('contracts/routes.json', repoRoot)), 'utf8')) as {
    routes: string[];
  }
).routes;

/** Traduce una ruta del contrato al `page.tsx` que le corresponde en App Router. */
function pageFileFor(route: string): string {
  const segments = route === '/' ? [] : route.replace(/^\//, '').split('/');
  return `${appDir}${segments.join('/')}${segments.length > 0 ? '/' : ''}page.tsx`;
}

/** Todos los `page.tsx` bajo el directorio de la aplicación. */
function listPageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = `${dir}${entry.name}`;
    if (entry.isDirectory()) return listPageFiles(`${full}/`);
    return entry.name === 'page.tsx' ? [full] : [];
  });
}

describe('rutas frente a contracts/routes.json', () => {
  it('el contrato declara 35 rutas', () => {
    // 28 de P02, las tres del flujo de autenticación (DEC-016) y las cuatro del
    // módulo de servidores (DEC-020): panel del servidor, su solicitud, el
    // cambio de contraseña del primer acceso y la gestión de comisiones.
    expect(contractRoutes).toHaveLength(35);
  });

  it('no hay páginas fuera del contrato', () => {
    // El contrato manda en ambas direcciones: una ruta implementada sin
    // declarar es tan divergencia como una declarada sin implementar.
    const declared = new Set(contractRoutes.map(pageFileFor));
    const implemented = listPageFiles(appDir);
    const extra = implemented.filter((file) => !declared.has(file));

    expect(extra.map((f) => f.replace(appDir, ''))).toEqual([]);
  });

  it.each(contractRoutes)('%s tiene su página', (route) => {
    expect(existsSync(pageFileFor(route))).toBe(true);
  });

  it('la ruta pública de verificación usa el segmento exacto del contrato', () => {
    // PAY-031: es la URL que abre el QR impreso. Cambiarla invalida los
    // comprobantes ya emitidos, así que se fija por prueba.
    expect(contractRoutes).toContain('/verificar/comprobante/[token]');
  });

  it('ninguna ruta pública expone identificadores de persona', () => {
    // requirements.md §10: nada de PII en URLs.
    const publicRoutes = contractRoutes.filter(
      (r) => !r.startsWith('/admin') && !r.startsWith('/caja') && !r.startsWith('/comision'),
    );
    for (const route of publicRoutes) {
      expect(route).not.toMatch(/\[(personId|documento|email|ci|dni)\]/i);
    }
  });
});
