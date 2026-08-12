# Registro de decisiones — Sistema web ENCUENTRO v2.7

**No quedan decisiones `BLOCKING`.** Las dieciocho están `APPROVED`.

## Aprobadas

| ID | Título | Fecha | Fase que gobierna |
|---|---|---|---|
| [DEC-001](decisions/DEC-001.md) | Infraestructura productiva y estrategia de despliegue | 2026-07-13 | P14 |
| [DEC-002](decisions/DEC-002.md) | Modalidades y canales de pago de v1 | 2026-07-14 | P05, P07 |
| [DEC-003](decisions/DEC-003.md) | Comprobante de pago, numeración y verificación | 2026-07-22 | P07 |
| [DEC-004](decisions/DEC-004.md) | Llegada durante IN_PROGRESS, duración y servicios | 2026-07-22 | P03, P05, P06, P11 |
| [DEC-005](decisions/DEC-005.md) | `HELD` expira a los 30 minutos | 2026-08-05 | P06 |
| [DEC-006](decisions/DEC-006.md) | No se admiten menores de edad en v1 | 2026-08-05 | P05 |
| [DEC-007](decisions/DEC-007.md) | Sin devoluciones; saldo a favor | 2026-08-05 | P07, P12 |
| [DEC-008](decisions/DEC-008.md) | Sobrepago queda como saldo a favor | 2026-08-05 | P07, P12 |
| [DEC-009](decisions/DEC-009.md) | Tasa congelada al cargar la evidencia | 2026-08-05 | P07, P12 |
| [DEC-010](decisions/DEC-010.md) | Tamaño de documento configurable | 2026-08-05 | P08 |
| [DEC-011](decisions/DEC-011.md) | Retención indefinida de datos personales | 2026-08-05 | P13 |
| [DEC-012](decisions/DEC-012.md) | RPO 1 h, RTO 4 h, respaldo externo cifrado | 2026-08-05 | P14 |
| [DEC-013](decisions/DEC-013.md) | Verificación de correo obligatoria | 2026-08-05 | P04 |
| [DEC-014](decisions/DEC-014.md) | MFA obligatorio para cuentas con permisos | 2026-08-05 | P04 |
| [DEC-015](decisions/DEC-015.md) | Cierre del alcance QR bancario Bolivia | 2026-08-05 | P07 |
| [DEC-016](decisions/DEC-016.md) | Mecanismo de autenticación: Better Auth | 2026-08-05 | P04 |
| [DEC-017](decisions/DEC-017.md) | Google Sheets fuera de alcance en v1 | 2026-08-05 | P13 |
| [DEC-018](decisions/DEC-018.md) | Reconocimiento contable y matriz de asientos | 2026-08-07 | P12 |

## Pendientes de definición

Una decisión aprobada puede seguir sin poder aplicarse si le falta un dato. Estos no son decisiones abiertas —nadie tiene que elegir entre alternativas— sino datos que la organización todavía no ha dado. Se registran aquí y **detienen solo el alcance que dependen de ellos** (regla 01-no-guessing).

_No queda ninguno abierto._

### Resueltos

| ID | Depende de | Qué faltaba | Cómo se resolvió |
|---|---|---|---|
| TBD-001 | DEC-009 | **La tasa de cambio no tenía fuente.** La decisión dice congelarla al cargar la evidencia y `payment_proofs.exchange_rate_micros` existía para guardarla, pero no había ninguna tasa configurada por gestión. Sin fuente, congelar significaba inventar un número que acabaría impreso en un comprobante. Detectado el 8 de agosto de 2026. | **Registro diario en la configuración de la gestión**, cerrado el 11 de agosto de 2026. La organización eligió que la tasa la registre una persona con `event.update` y no una fuente web: el número sostiene una conciliación y acaba en papel, así que tiene que haber alguien que responda por él — y funciona sin internet, que en un encuentro presencial cuenta. Tabla `exchange_rates`, una por gestión, moneda y día. `assertDeclarableEvidence` deja de rechazar la rama multimoneda y exige que **haya tasa del día del pago**, con `EXCHANGE_RATE_MISSING` cuando falta. La tasa se congela en la evidencia al cargarla; cambiar la registrada después no altera lo ya cobrado. |

## Riesgos registrados junto a una decisión aprobada

Aprobar una decisión no elimina su riesgo. Estos quedan abiertos y deben revisarse:

| Decisión | Riesgo |
|---|---|
| DEC-005 | 30 minutos exige un worker que expire con puntualidad. Si el `HELD` pasara a cubrir la espera de revisión humana, el plazo sería insuficiente. |
| DEC-006 | Si en la práctica asisten menores, quedarán fuera del sistema y sin trazabilidad. Revisar antes del piloto de P15. |
| DEC-009 | La organización absorbe el movimiento cambiario entre la carga de la evidencia y su aprobación. |
| DEC-011 | La PII crece sin límite. Anonimizar retroactivamente será mucho más costoso que haberlo diseñado desde el inicio. Revisar antes de una segunda gestión productiva. |
| DEC-012 | Perder una hora durante el evento puede significar un bloque de cobros en caja; debe poder reconstruirse desde los comprobantes emitidos. |
| DEC-014 | Personal en campo puede perder su dispositivo. El restablecimiento presencial y auditado debe estar en el runbook de P15. |
| DEC-018 | Fija roles contables, no cuentas. Si la organización no asigna una cuenta a cada rol antes de contabilizar, el motor no puede resolver ningún asiento. |

## Nota sobre DEC-016

La decisión estaba redactada como «Auth.js estable o alternativa». La verificación del ecosistema el 2026-08-05 resolvió la premisa: Auth.js no está estable. Ver [DEC-016](decisions/DEC-016.md) y [ADR-010](../02-architecture/adr/ADR-010.md).
