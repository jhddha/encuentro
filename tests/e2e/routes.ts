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
  { path: '/e/ENC2026', shell: 'peregrino' },
  { path: '/e/ENC2026/inscripcion', shell: 'peregrino · comparador de modalidad' },
  { path: '/e/ENC2026/mi-cuenta/pagos', shell: 'peregrino' },
  { path: '/admin', shell: 'administración' },
  { path: '/admin/e/ENC2026/configuracion', shell: 'administración · configuración' },
  { path: '/admin/e/ENC2026/comprobantes', shell: 'administración' },
  { path: '/caja/e/ENC2026/CAJA-01', shell: 'caja' },
  { path: '/comision/e/ENC2026/INSCRIPCIONES', shell: 'comisión' },
  { path: '/scanner/e/ENC2026/EST-01', shell: 'estación' },
];
