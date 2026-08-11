/**
 * Rutas concretas que recorre el gate de accesibilidad.
 *
 * `contracts/routes.json` declara plantillas con segmentos dinámicos
 * (`[eventCode]`, `[token]`). Aquí se instancian con valores de ejemplo para
 * poder navegarlas de verdad. Los valores no representan datos reales: aún no
 * hay base de datos, y las páginas renderizan su estado de solo lectura.
 *
 * Se cubre un representante por shell más las pantallas que P02 implementa con
 * contenido propio, no las 28 rutas: el objetivo es validar shells, estados y
 * componentes, y las 21 restantes comparten exactamente esa estructura.
 */
export interface SampleRoute {
  readonly path: string;
  readonly shell: string;
}

export const SAMPLE_ROUTES: readonly SampleRoute[] = [
  { path: '/', shell: 'público' },
  { path: '/verificar/comprobante/tok_ejemplo', shell: 'público' },
  { path: '/ingresar', shell: 'autenticación' },
  { path: '/verificar-correo', shell: 'autenticación' },
  { path: '/e/ENC2026', shell: 'peregrino' },
  { path: '/e/ENC2026/inscripcion', shell: 'peregrino · comparador de modalidad' },
];

/*
 * LO QUE ESTA LISTA YA NO CUBRE, Y POR QUÉ
 *
 * Solo quedan las rutas que un anónimo puede **renderizar de verdad**. Cada vez
 * que una pantalla gana su guardián, recorrerla aquí deja de comprobar esa
 * pantalla y pasa a comprobar `/ingresar` otra vez: la suite sigue en verde y la
 * cobertura se evapora sin que nadie lo note. Es peor que no tenerla.
 *
 * Salieron en su día las dieciséis rutas de /admin (P04). Salen ahora, al
 * cerrarles la puerta:
 *   /configurar-mfa                    exige sesión y expulsa a quien ya tiene 2FA
 *   /caja/e/…, /comision/e/…, /scanner/e/…   layouts nuevos con `requireActor`
 *   /e/ENC2026/mi-cuenta/pagos         ya redirigía desde P07; nadie lo quitó
 *
 * Son 25 de las 31 rutas del contrato sin verificación automática de
 * accesibilidad. No es una regresión de este cambio: es la deuda que ya había,
 * ahora contada.
 *
 * Lo que la salda es un fixture de sesión de Playwright —cuenta sembrada, TOTP
 * generado en la propia prueba— que permita recorrerlas autenticado. Mientras
 * no exista, la accesibilidad de todo lo que hay detrás de un inicio de sesión
 * solo la ha visto una persona mirando.
 */
