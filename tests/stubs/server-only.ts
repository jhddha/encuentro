/**
 * Sustituto de `server-only` para las pruebas.
 *
 * El paquete real lanza al importarse fuera del servidor de Next, lo que hace
 * imposible probar cualquier módulo que lo lleve. Aquí no hace nada.
 *
 * No se quita la marca de los módulos: existe para que el build falle si algo
 * del servidor acaba importado desde un componente cliente (regla
 * 02-domain-boundaries), y esa garantía sigue en pie porque el sustituto solo
 * se aplica en `vitest.config.mts`.
 */
export {};
