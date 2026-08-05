# Registro de decisiones — Sistema web ENCUENTRO v2.7

## Aprobadas

| ID | Título | Estado | Fecha |
|---|---|---|---|
| [DEC-001](decisions/DEC-001.md) | Infraestructura productiva y estrategia de despliegue | APPROVED | 2026-07-13 |
| [DEC-002](decisions/DEC-002.md) | Modalidades y canales de pago de v1 | APPROVED | 2026-07-14 |
| [DEC-003](decisions/DEC-003.md) | Comprobante de pago, numeración y verificación | APPROVED | 2026-07-22 |
| [DEC-004](decisions/DEC-004.md) | Llegada durante IN_PROGRESS, duración y servicios | APPROVED | 2026-07-22 |
| [DEC-013](decisions/DEC-013.md) | Verificación de correo obligatoria | APPROVED | 2026-08-05 |
| [DEC-014](decisions/DEC-014.md) | MFA obligatorio para cuentas con permisos | APPROVED | 2026-08-05 |
| [DEC-016](decisions/DEC-016.md) | Mecanismo de autenticación: Better Auth | APPROVED | 2026-08-05 |

## Pendientes

| ID | Tema | Estado | Fase que bloquea |
|---|---|---|---|
| DEC-005 | Duración de `HELD` y reglas restantes de hospedaje | BLOCKING cuando aplique | P06 |
| DEC-006 | Menores, documento obligatorio y consentimiento | BLOCKING cuando aplique | P05 |
| DEC-007 | Cancelaciones y reembolsos | BLOCKING cuando aplique | P07, P12 |
| DEC-008 | Tratamiento de sobrepagos | BLOCKING cuando aplique | P07, P12 |
| DEC-009 | Fuente y momento del tipo de cambio | BLOCKING cuando aplique | P07, P12 |
| DEC-010 | Equipo y tamaño exacto de credencial/recibo | BLOCKING cuando aplique | P08 |
| DEC-011 | Retención y anonimización | BLOCKING cuando aplique | P13 |
| DEC-012 | RPO/RTO y proveedor de backup | BLOCKING cuando aplique | P14 |
| DEC-015 | Cierre formal del alcance QR Bolivia; v1 ya es manual por DEC-002 | BLOCKING cuando aplique | P07 |
| DEC-017 | Alcance y frecuencia de Google Sheets | BLOCKING cuando aplique | P13 |

## Nota sobre DEC-016

La decisión estaba redactada como «Auth.js estable o alternativa». La verificación del ecosistema el 2026-08-05 resolvió la premisa: Auth.js no está estable. Ver [DEC-016](decisions/DEC-016.md) y [ADR-010](../02-architecture/adr/ADR-010.md).
