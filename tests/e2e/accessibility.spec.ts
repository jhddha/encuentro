import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { SAMPLE_ROUTES } from './routes';

/**
 * Gate de accesibilidad de P02.
 *
 * WCAG 2.2 AA en flujos críticos (requirements.md §10). Se ejecuta contra los
 * cinco viewports declarados en `playwright.config.ts`, así que un fallo dice
 * también en qué tamaño ocurre.
 *
 * Las etiquetas `wcag22aa` incluyen por herencia wcag2a, wcag2aa y wcag21aa.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

for (const route of SAMPLE_ROUTES) {
  test(`sin violaciones WCAG 2.2 AA en ${route.path}`, async ({ page }) => {
    await page.goto(route.path);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    // El mensaje enumera regla y selector: un fallo debe ser accionable sin
    // tener que reproducirlo a mano.
    const summary = results.violations.map(
      (v) => `${v.id} (${v.impact ?? 'sin impacto'}): ${v.nodes.map((n) => n.target).join(', ')}`,
    );

    expect(summary, `Violaciones en ${route.path}`).toEqual([]);
  });
}

test.describe('estructura accesible común', () => {
  for (const route of SAMPLE_ROUTES) {
    test(`${route.path} tiene landmarks y un solo h1`, async ({ page }) => {
      await page.goto(route.path);

      // WCAG 2.4.1: el enlace de salto debe existir y ser el primer foco.
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();

      await expect(page.locator('main#contenido')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    });
  }
});

test.describe('sin desbordamiento horizontal', () => {
  for (const route of SAMPLE_ROUTES) {
    test(`${route.path} no obliga a hacer scroll lateral`, async ({ page }) => {
      await page.goto(route.path);

      // El contenido ancho debe hacer scroll dentro de su componente
      // (design-system.md §4), nunca empujando el ancho del documento.
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });

      expect(overflow, `desbordamiento en ${route.path}`).toBeLessThanOrEqual(1);
    });
  }
});
