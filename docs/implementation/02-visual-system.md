# P02 — Sistema visual, rutas y shells

**Fecha:** 5 de agosto de 2026
**Alcance:** tokens, shells, las 28 rutas del contrato, verificación pública de comprobante y pantallas de modalidad y configuración.

## 1. Gate ejecutado

| Paso | Comando | Exit |
|---|---|---:|
| Validador documental | `python scripts/validate_canonical_docs.py` | 0 |
| Instalación congelada | `pnpm install --frozen-lockfile` | 0 |
| Formato | `pnpm format` | 0 |
| Lint | `pnpm lint` | 0 |
| Typecheck | `pnpm typecheck` | 0 |
| Unitarias | `pnpm test` — **62 pruebas, 4 archivos** | 0 |
| Build | `pnpm build` — 28 rutas | 0 |
| **Accesibilidad y responsive** | `pnpm test:e2e` — **165 pruebas** | 0 |

El gate propio de esta fase es el último: 33 comprobaciones por cada uno de los cinco viewports canónicos (390, 768, 1280, 1440, 1920).

## 2. Rutas

Las 28 rutas de `contracts/routes.json` existen y compilan, ni una más ni una menos. La correspondencia está protegida por prueba, no por revisión manual: `packages/config/src/routes.test.ts` recorre el contrato y exige el `page.tsx` correspondiente.

Esa prueba ya sirvió para algo. Al generar las páginas marcador, el script corrió con el directorio de trabajo equivocado y escribió 21 archivos en `apps/web/src/app/apps/web/src/app/…`. El build habría pasado igual —Next simplemente no habría encontrado esas rutas— pero la prueba falló señalando exactamente cuáles faltaban.

| Shell | Rutas | Estado |
|---|---:|---|
| Público | 2 | landing y verificación de comprobante |
| Peregrino | 7 | shell con navegación completa |
| Administración | 16 | shell + sub-shell por gestión |
| Caja | 1 | shell propio |
| Comisión | 1 | shell propio |
| Estación de escaneo | 1 | shell propio |

Las rutas cuyo contenido pertenece a fases posteriores renderizan `PendingScreen`: encabezado real más un estado de solo lectura que nombra la fase responsable y el requisito. No hay páginas en blanco ni datos inventados.

## 3. Accesibilidad

Se verifica con axe-core 4.12.1 sobre las etiquetas `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` y `wcag22aa`. Además de las reglas automáticas, hay comprobaciones estructurales explícitas:

- El enlace «Saltar al contenido» existe y es **el primer elemento que recibe foco** (WCAG 2.4.1).
- Cada página tiene exactamente un `h1` y un `main#contenido`.
- `<html lang="es">`.
- El documento **no desborda horizontalmente** en ningún viewport; el contenido ancho hace scroll dentro de su propio componente (`design-system.md` §4).

### Defecto encontrado y corregido

La primera corrida falló en 50 de 165 pruebas: solo la pantalla de configuración tenía `h1`, porque era la única que usaba `PageHeader`. Todas las demás empezaban su jerarquía de encabezados en `h2`, lo que deja la navegación por encabezados de un lector de pantalla sin punto de partida. Se corrigió en el origen —`PendingScreen` ahora incluye el encabezado— en lugar de relajar la prueba.

### Decisiones de accesibilidad tomadas

- **`StatusBadge` nunca depende solo del color** (`design-system.md` §3): cada tono lleva además un símbolo propio, así que el estado se lee en escala de grises, con daltonismo o con colores forzados por el usuario.
- **`PaymentModeCards` es un grupo de radio**, no dos botones. REG-019 exige elegir exactamente una modalidad; con `fieldset`, `legend` y `input[type=radio]` esa exclusividad también es real para teclado y lectores de pantalla.
- **`ScrollableTable` es focalizable**: una región con scroll que no se puede alcanzar por teclado es inaccesible para quien no usa ratón.

## 4. Verificación pública de comprobante

Es la única ruta del sistema que expone datos de una transacción sin sesión, así que el control no se dejó en la plantilla.

La regla vive en el dominio, en `toPublicReceiptVerification`, que **construye el objeto campo por campo** en vez de copiar el registro y borrar lo sensible. La diferencia importa: con el enfoque de copiar-y-borrar, añadir una columna a `receipts` filtra PII en cuanto alguien olvida actualizar la lista de exclusión. Construyendo campo por campo, lo nuevo queda fuera por omisión.

Seis pruebas lo respaldan. Una de ellas añade una columna `nationalId` al registro interno y verifica que no aparezca en la salida — es decir, prueba el comportamiento ante un cambio futuro, no solo el estado actual.

El componente `ReceiptVerificationResult` recibe únicamente el tipo `PublicReceiptVerification`. No puede filtrar PII porque nunca la recibe.

`verifyReceiptToken` devuelve hoy `unavailable`, no `not-found`. Son cosas distintas y el usuario merece saber cuál es: «no existe ese comprobante» y «todavía no puedo responder» llevan a acciones diferentes. El servicio real llega en P07.

## 5. Microcopy

Los cinco textos canónicos de `design-system.md` §8 están en `packages/ui/src/microcopy.ts`, y una prueba comprueba que cada cadena **siga apareciendo literalmente en el documento fuente**. Si alguien reescribe el documento, la prueba falla; si alguien reescribe el código, también.

Hay además una prueba que prohíbe la expresión «pago online» en todo el microcopy. `design-system.md` §6 la veta explícitamente porque sugiere checkout automático, que DEC-002 y PAY-022 excluyen de v1.

## 6. Qué NO se implementó, y por qué

| Omisión | Motivo |
|---|---|
| Autenticación | DEC-016 sigue BLOCKING. El shell de administración es hoy público; el punto donde exigir sesión y resolver permisos ya está identificado en `apps/web/src/app/admin/layout.tsx`. |
| Datos reales en cualquier pantalla | No hay base de datos hasta P03. Ninguna pantalla finge contenido. |
| Componentes ligados a datos | `PriceVersionEditor`, `PaymentProofUploader`, `ProofReviewPanel`, `HotelAvailabilityPicker`, `LodgingPolicyForm`, `MealServiceEditor` y `AuditTrail` (design-system.md §7) se implementan en la fase que los necesita. |
| Importes en el comparador de modalidad | Salen de `price_versions` (P05). PKG-012 exige montos explícitos, no un descuento calculado, así que no se inventa ninguno. |

## 7. Riesgos y pendientes

1. **La cobertura de accesibilidad usa 11 rutas representativas, no las 28.** Las 21 restantes comparten shell, estados y componentes con alguna de las cubiertas. Cuando dejen de ser marcadores habrá que incorporarlas.
2. **axe-core no sustituye una revisión manual.** Detecta alrededor de un tercio de los problemas reales de WCAG; contraste con imágenes de fondo, orden de lectura y coherencia de foco necesitan revisión humana antes del go/no-go (P15).
3. **Contraste de los tokens sin verificar formalmente.** `--color-flame` (`#D63B2F`) sobre `--color-ivory` (`#F7F2EA`) se usa en CTA. axe no lo marcó en las combinaciones presentes, pero conviene una auditoría de la paleta completa cuando existan más superficies.
4. **`next start` no funciona con `output: 'standalone'`.** El empaquetado se activa ahora con `BUILD_STANDALONE=1`, para que las pruebas E2E puedan arrancar el servidor. El Dockerfile de P14 debe fijar esa variable.
5. Siguen abiertos H-02 a H-06 de la auditoría P00. **H-05 y H-06 requieren decisión humana** sobre qué permisos deben existir.
