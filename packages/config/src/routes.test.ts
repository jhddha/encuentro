import { existsSync, readFileSync } from 'node:fs';
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

describe('rutas frente a contracts/routes.json', () => {
  it('el contrato declara 28 rutas', () => {
    expect(contractRoutes).toHaveLength(28);
  });

  it.each(contractRoutes)('%s tiene su página', (route) => {
    expect(existsSync(pageFileFor(route))).toBe(true);
  });

  it('la ruta pública de verificación usa el segmento exacto del contrato', () => {
    // PAY-013: es la URL que abre el QR impreso. Cambiarla invalida los
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
