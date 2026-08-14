import { expect, test, type Page } from '@playwright/test';

import { ACTORES, EVENTO, estado } from './actores';
import { RUTAS_GUARDADAS } from './rutas-contrato';

/**
 * Humo de las pantallas que exigen sesión.
 *
 * La afirmación no es «responde 200». La pantalla de acceso también responde
 * 200, y por eso un formulario que daba por buena una respuesta sin sesión pasó
 * inadvertido: navegaba a `/admin`, el guardián devolvía a `/ingresar`, y desde
 * fuera parecía que la página se recargaba sola.
 *
 * Aquí se comprueba **la URL en la que se acaba**, que hay exactamente un `h1`
 * y que la cabecera muestra el correo de quien entró. Las tres juntas dicen que
 * la sesión llegó viva hasta el servidor.
 */

async function afirmarPantallaPropia(page: Page, ruta: string, correo: string): Promise<void> {
  await expect(page, `${ruta} devolvió a la pantalla de acceso`).not.toHaveURL(/\/ingresar/);

  // Un solo h1 por página: sin él la navegación por encabezados empieza en el
  // vacío (WCAG 2.4.1, regla 05-ui-accessibility).
  await expect(page.locator('h1')).toHaveCount(1);

  await expect(page.getByText(correo)).toBeVisible();
}

for (const clave of ['peregrino', 'tesoreria', 'admin'] as const) {
  const rutas = RUTAS_GUARDADAS.filter((ruta) => ruta.actor === clave);

  if (rutas.length === 0) continue;

  test.describe(`pantallas de ${clave}`, () => {
    test.use({ storageState: estado(clave) });

    for (const ruta of rutas) {
      test(`${ruta.plantilla} se abre con su personaje`, async ({ page }) => {
        await page.goto(ruta.ruta);
        await afirmarPantallaPropia(page, ruta.plantilla, ACTORES[clave].correo);
      });
    }
  });
}

test.describe('el peregrino inscrito', () => {
  test.use({ storageState: estado('peregrino') });

  test('puede declarar un pago, no solo ver el formulario', async ({ page }) => {
    await page.goto(`/e/${EVENTO}/mi-cuenta/pagos`);

    /*
     * La afirmación que importa no es «hay formulario» sino «se puede enviar».
     * Sin un canal de adelanto activo el desplegable sale vacío: el formulario
     * existe, se renderiza entero y no sirve para nada.
     */
    const canal = page.getByLabel('Banco o plataforma');
    await expect(canal).toBeVisible();
    expect(await canal.locator('option').count()).toBeGreaterThan(0);

    await expect(page.getByRole('button', { name: 'Enviar comprobante' })).toBeVisible();
  });

  /*
   * La moneda del importe es la del canal, no la de la gestión.
   *
   * El rótulo estaba fijo en la moneda de la gestión, así que al elegir un
   * canal extranjero seguía diciendo la otra. No era solo el rótulo: la
   * declaración se construía con esa misma moneda y el dominio la rechazaba por
   * no casar con el canal, de modo que el cobro en otra divisa no se podía
   * declarar en absoluto. Toda la suite estaba en verde.
   */
  test('el importe cambia de moneda con el canal elegido', async ({ page }) => {
    await page.goto(`/e/${EVENTO}/mi-cuenta/pagos`);

    const canal = page.getByLabel('Banco o plataforma');

    // `selectOption` exige la etiqueta literal: no admite expresión regular.
    await canal.selectOption({ label: 'Transferencia a cuenta — Estados Unidos · USD' });
    await expect(page.getByLabel(/^Importe transferido \(USD\)$/)).toBeVisible();

    await canal.selectOption({ label: 'QR Simple — Bolivia · BOB' });
    await expect(page.getByLabel(/^Importe transferido \(BOB\)$/)).toBeVisible();

    // Y se dice en qué moneda están sus cargos, que es la pregunta siguiente.
    await expect(page.getByText(/Sus cargos están en USD/)).toBeVisible();
  });

  test('ve sus cargos y su saldo', async ({ page }) => {
    await page.goto(`/e/${EVENTO}/mi-cuenta`);

    await expect(page.getByText('420.00').first()).toBeVisible();
  });
});

test.describe('tesorería', () => {
  test.use({ storageState: estado('tesoreria') });

  test('entra en la bandeja de comprobantes', async ({ page }) => {
    await page.goto(`/admin/e/${EVENTO}/comprobantes`);

    await expect(page).toHaveURL(new RegExp(`/admin/e/${EVENTO}/comprobantes$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/comprobantes/i);
  });
});
