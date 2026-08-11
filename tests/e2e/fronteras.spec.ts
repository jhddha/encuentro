import { expect, test } from '@playwright/test';

import { ACTORES, EVENTO, estado } from './actores';

/**
 * Las fronteras de autorización, vistas desde el navegador.
 *
 * Las pruebas de dominio ya comprueban que `can()` dice que no. Lo que ninguna
 * comprobaba es que **la pantalla hace algo con ese no**: entre la decisión y lo
 * que ve la persona hay un layout, una redirección y una frontera de error, y
 * ahí es donde vivían los fallos de esta semana.
 *
 * Cada afirmación negativa —«este rol no puede»— vale más que su equivalente
 * positiva: una pantalla que se abre para todos también se abre para quien debe
 * verla, y aparenta estar bien.
 */

const AUDITORIA = `/admin/e/${EVENTO}/auditoria`;
const MI_CUENTA = `/e/${EVENTO}/mi-cuenta`;

test.describe('el peregrino', () => {
  test.use({ storageState: estado('peregrino') });

  test('acaba en su cuenta cuando pide administración', async ({ page }) => {
    await page.goto('/admin');

    // IAM-003: sin asignaciones no hay permiso que conceder en ninguna pantalla
    // de administración, así que no es una pantalla vacía: es otra pantalla.
    await expect(page).toHaveURL(new RegExp(`${MI_CUENTA}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/mi cuenta/i);
  });

  test('no alcanza la auditoría', async ({ page }) => {
    await page.goto(AUDITORIA);

    await expect(page).toHaveURL(new RegExp(`${MI_CUENTA}$`));
  });

  test('ve su correo en la cabecera y puede cerrar sesión', async ({ page }) => {
    await page.goto(MI_CUENTA);

    await expect(page.getByText(ACTORES.peregrino.correo)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  });
});

test.describe('tesorería', () => {
  test.use({ storageState: estado('tesoreria') });

  test('con el segundo factor activo no vuelve a la pantalla de registrarlo', async ({ page }) => {
    await page.goto('/configurar-mfa');

    /*
     * DEC-014. `enable` **sustituye** el secreto: volver aquí con el botón Atrás
     * y confirmar la contraseña dejaba inservible la aplicación autenticadora ya
     * configurada.
     */
    await expect(page).not.toHaveURL(/configurar-mfa/);
  });

  test('no puede leer la auditoría', async ({ page }) => {
    await page.goto(AUDITORIA);

    /*
     * TESORERIA no tiene `audit.read` —comprobado contra `role_permissions`—, así
     * que `authorize` lanza y la frontera de error lo recoge. Es la única prueba
     * que distingue «el permiso se comprueba» de «el permiso está escrito en un
     * comentario».
     */
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /no pudimos mostrar esta pantalla/i,
    );
  });
});

test.describe('administración', () => {
  test.use({ storageState: estado('admin') });

  test('lee la auditoría de la gestión', async ({ page }) => {
    await page.goto(AUDITORIA);

    await expect(page).toHaveURL(new RegExp(`${AUDITORIA}$`));
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(
      /no pudimos mostrar esta pantalla/i,
    );
  });

  test('no puede revisar comprobantes', async ({ page }) => {
    await page.goto(`/admin/e/${EVENTO}/comprobantes`);

    // ADMIN_MASTER no lleva `payment.proof.review`: quien administra no aprueba
    // dinero. Es una separación deliberada, no un olvido.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /no pudimos mostrar esta pantalla/i,
    );
  });
});
