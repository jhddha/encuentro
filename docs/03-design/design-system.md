# Sistema web ENCUENTRO — Identidad digital y UX v2.7

## 1. Dirección visual

Sobria, carismática, contemporánea, cálida y operacionalmente clara. La Mansión es la marca institucional y el Encuentro identifica la gestión.

## 2. Tipografía

- Títulos: Playfair Display; fallback Georgia/serif.
- UI, tablas y formularios: Source Sans 3; fallback Segoe UI/Arial/sans-serif.
- Datos monoespaciados: `ui-monospace`.

## 3. Tokens

| Token | Hex | Uso |
|---|---|---|
| `--color-ink` | `#171312` | texto/navegación |
| `--color-ivory` | `#F7F2EA` | fondo |
| `--color-flame` | `#D63B2F` | CTA |
| `--color-fire` | `#F08A24` | acento |
| `--color-gold` | `#D6A12E` | en curso |
| `--color-wine` | `#5B2328` | superficies solemnes |
| `--color-success` | `#2E7D32` | éxito |
| `--color-warning` | `#D98E04` | pendiente |
| `--color-danger` | `#C62828` | error |
| `--color-info` | `#2563EB` | información |

Nunca depender solo del color.

## 4. Responsive y accesibilidad

390+ móvil, 768+ tableta, 1280+ laptop y 1440/1920 escritorio. Área táctil mínima 44×44 px. WCAG 2.2 AA en flujos críticos. Tablas hacen scroll dentro del componente.

## 5. Rutas y navegación

- Público: `/`, `/e/[eventCode]`, `/e/[eventCode]/inscripcion`, `/verificar/comprobante/[token]`.
- Peregrino: `/e/[eventCode]/mi-cuenta`, `/pagos`, `/hospedaje`, `/credencial`, `/notificaciones`.
- Administración: `/admin`, `/admin/e/[eventCode]/...`.
- Comisión: `/comision/e/[eventCode]/[commissionCode]/...`.
- Caja: `/caja/e/[eventCode]/[cashCode]`.

## 6. Pantallas modificadas por DEC-001..004

### Comparador de modalidad

Dos tarjetas exclusivas:

1. **Pago anticipado** — precio especial, fecha límite, pago mínimo, canales disponibles, derecho a escoger hotel tras aprobación.
2. **Pago al llegar** — precio normal, efectivo/QR y hotel entre disponibilidad restante.

No usar “pago online” como sinónimo de pago automático.

### Catálogo administrativo

Campos: visibilidad `PUBLIC/PRIVATE`, precio anticipado, precio normal, vigencia, mínimo 50%, vencimiento del saldo, hoteles habilitados y estado.

### Configuración de gestión

Muestra fechas, zona horaria, total calculado de días, periodo de hospedaje y cantidad de noches. Valores de referencia visibles, nunca fijados en código.

### Hospedaje

El peregrino selecciona hotel; la habitación se muestra como “Asignada por Hospedaje”. Una reserva confirmada no muestra mensajes de liberación por llegada tardía.

### Alimentación

Calendario por día con servicio, tipo, hora inicial/final, pedido, recibido, disponible, entregado y desperdicio.

### Comprobante de pago

Título exacto, número, datos mínimos del peregrino, detalle del pago, saldo, QR y pie “Documento de control interno”. La vista pública muestra datos mínimos; el botón de detalle administrativo exige autenticación.

## 7. Componentes obligatorios

`PaymentModeCards`, `PriceVersionEditor`, `PrivatePackageBadge`, `PaymentProofUploader`, `ProofReviewPanel`, `BalanceSummary`, `HotelAvailabilityPicker`, `LodgingPolicyForm`, `MealServiceEditor`, `ReceiptView`, `ReceiptVerificationResult`, `AuditTrail`.

## 8. Microcopy

- `IN_PROGRESS`: “El evento está en curso. Las inscripciones y pagos continúan habilitados.”
- Anticipado pendiente: “Recibimos tu comprobante. El beneficio se habilitará cuando sea aprobado.”
- Anticipado aprobado: “Tu tarifa especial está confirmada. Ya puedes escoger hotel según disponibilidad.”
- Pago al llegar: “Pagarás el precio normal y escogerás hotel entre las opciones disponibles al llegar.”
- Fuera de horario de comida: “Este servicio no está disponible en este horario.”
