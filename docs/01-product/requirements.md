# Sistema web ENCUENTRO — Requisitos funcionales y reglas de negocio v2.7

**Fuente canónica de producto**  
**Fecha:** 22 de julio de 2026

## 0. Propósito

Este documento define qué debe hacer el sistema. La arquitectura, contratos, diseño, prototipo, prompts, código y pruebas deben respetarlo. Ante un vacío, se registra una decisión; no se inventa comportamiento.

## 1. Glosario

| Término | Definición canónica |
|---|---|
| Gestión | Edición anual del Encuentro, identificada por `event_id`. |
| Pago anticipado | Modalidad con precio reducido, fecha límite y elección de hotel tras aprobación mínima del 50%. |
| Pago al llegar | Modalidad con precio normal y hotel según disponibilidad restante. |
| Canal de pago | Medio concreto: QR Bolivia, cuenta/enlace EE. UU., efectivo o QR en caja. |
| Comprobante bancario | Evidencia cargada por el peregrino; no confirma dinero por sí sola. |
| Comprobante de pago | Documento interno emitido por cada pago aprobado. |
| Estado de cuenta | Resumen dinámico de cargos, pagos y saldo. |
| Paquete privado | Paquete no visible al público, asignable solo por Inscripciones. |
| Reserva `HELD` | Retención temporal pendiente de confirmación, sujeta a DEC-005. |
| Reserva `CONFIRMED` | Reserva confirmada que no se libera por llegada tardía. |

## 2. Alcance v1

Incluye gestiones, usuarios/RBAC, preinscripción, inscripción presencial, catálogo, pagos manuales, cajas, hospedaje, transporte, alimentos, materiales, servidores, credenciales/QR, contabilidad simplificada, notificaciones, reportes, auditoría y observabilidad.

Excluye checkout automático, facturación fiscal, presupuestos, centros de costo visibles, microservicios, app nativa y prorrateo por días transcurridos.

## 3. Invariantes transversales

| ID | Regla | Criterio verificable |
|---|---|---|
| GOV-001 | Todo registro transaccional aplicable pertenece a una gestión. | Una operación sin contexto falla con `EVENT_CONTEXT_REQUIRED`. |
| GOV-002 | Las fechas no cambian automáticamente el estado. | El estado solo cambia por transición manual auditada. |
| GOV-003 | `ACTIVE` e `IN_PROGRESS` permiten nuevas inscripciones y pagos. | E2E antes del evento, día 1, día 3 y último día. |
| GOV-004 | Solo `OPERATIONALLY_CLOSED` y posteriores bloquean operaciones ordinarias. | UI y API usan el mismo error. |
| GOV-005 | Históricos financieros y operativos no se reescriben. | Corrección por reversión, ajuste o anulación. |
| GOV-006 | Toda mutación sensible valida permiso, scope, estado, versión e idempotencia. | La API rechaza bypass de UI. |
| GOV-007 | SMTP, reglas y plantillas son globales. | No llevan `event_id`. |
| GOV-008 | Una falla de integración no revierte una operación confirmada. | Trabajo reintentable en worker. |
| GOV-009 | No hay hard delete para pagos, recibos, asientos, cierres, entregas o auditoría. | Repositorios carecen de borrado físico. |
| GOV-010 | Una decisión `BLOCKING` no puede ser resuelta por el agente. | El validador y los prompts detienen el alcance dependiente. |

## 4. Estados canónicos

### 4.1 Gestión

`DRAFT -> READY -> ACTIVE -> IN_PROGRESS -> OPERATIONALLY_CLOSED -> FINANCIALLY_CLOSED -> ARCHIVED`

`READY -> DRAFT` se permite para corregir configuración. `ACTIVE -> OPERATIONALLY_CLOSED` exige motivo. No existe `REGISTRATION_CLOSED`.

### 4.2 Inscripción, pago y asistencia

- Inscripción: `DRAFT`, `SUBMITTED`, `CONFIRMED`, `CANCELLED`.
- Pago calculado: `UNPAID`, `PARTIAL`, `PAID`, `OVERPAID`, `REFUNDED`.
- Asistencia: `NOT_ARRIVED`, `CHECKED_IN`, `NO_SHOW`, `COMPLETED`.
- Evidencia de pago: `PENDING_UPLOAD`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `CORRECTION_REQUESTED`, `REPLACED`, `CANCELLED`.
- Pago: `PENDING`, `SUCCEEDED`, `CANCELLED`, `PARTIALLY_REFUNDED`, `REFUNDED`.
- Reserva: `HELD`, `CONFIRMED`, `RELEASED`, `CANCELLED`, `EXPIRED`.

## 5. Gestión y configuración

| ID | Requisito | Criterio |
|---|---|---|
| EVT-001 | ADMIN_MASTER crea una gestión con código y año únicos. | Duplicado falla. |
| EVT-002 | La gestión define nombre, fechas, zona horaria, moneda, duración, noches, oferta, métodos, cajas, comisiones y términos. | No pasa a READY con bloqueo crítico. |
| EVT-003 | Las transiciones son manuales, transaccionales y auditadas. | Actor, motivo, versión y fecha quedan registrados. |
| EVT-004 | `ACTIVE` publica y habilita inscripción/pago. | Landing resuelve una única gestión pública. |
| EVT-005 | `IN_PROGRESS` mantiene inscripción, pago y operación completa. | No crea una tarifa por día transcurrido. |
| EVT-006 | Solo una gestión puede estar públicamente habilitada. | Constraint/lock impide dos. |
| EVT-007 | `start_at` y `end_at` son configurables. | La UI calcula y muestra el total de días. |
| EVT-008 | La referencia actual es 8 días, sin valor fijo en código. | Prueba con otra duración. |
| EVT-009 | El cierre operativo valida cajas, sync y bloqueos. | No cierra con pendientes críticos. |
| EVT-010 | El cierre guarda snapshot inmutable. | Reproducible desde auditoría. |

## 6. Catálogo, inscripción y precios

| ID | Requisito | Criterio |
|---|---|---|
| PKG-001 | Cada paquete pertenece a una gestión y tiene versiones históricas. | Cambiar precio no altera cargos existentes. |
| PKG-002 | `visibility` admite `PUBLIC` y `PRIVATE`. | El portal solo lista `PUBLIC`. |
| PKG-003 | Paquetes privados solo pueden ser vistos/asignados por Inscripciones con permiso. | Intento sin permiso falla y asignación queda auditada. |
| PKG-004 | Cada paquete puede definir tarifa anticipada y tarifa normal. | Ambas son montos explícitos, no descuento calculado obligatorio. |
| PKG-005 | La tarifa anticipada tiene inicio/fin, moneda, mínimo de pago y vencimiento de saldo. | Configuración versionada. |
| REG-001 | El peregrino selecciona exactamente una modalidad: anticipado o al llegar. | No se confunde con canal de pago. |
| REG-002 | El cargo congela paquete, versión de precio, moneda e importe. | Histórico inmutable. |
| REG-003 | El pago anticipado aprobado al 50% conserva tarifa y habilita elección de hotel. | La carga sin aprobación no habilita. |
| REG-004 | Comprobante cargado dentro del plazo conserva tarifa aunque se revise después. | Prueba de borde de fecha. |
| REG-005 | Saldo restante puede pagarse al llegar sin repricing. | Mantiene el cargo original. |
| REG-006 | Durante `IN_PROGRESS` el importe no se prorratea. | Día 1, 3 y último día cobran el paquete completo. |
| REG-007 | No existen tarifas tardías automáticas. | Solo paquete normal o privado previamente configurado. |
| REG-008 | El peregrino elige hotel; Hospedaje asigna habitación. | UI pública no promete habitación específica. |

## 7. Pagos, evidencias, cajas y comprobantes

| ID | Requisito | Criterio |
|---|---|---|
| PAY-001 | v1 procesa pagos manuales, no checkout automático. | No existen webhooks productivos ni SDK obligatorio de pasarela. |
| PAY-002 | Canales anticipados: `BOLIVIA_QR_MANUAL`, `US_ACCOUNT_MANUAL`, `US_PAYMENT_LINK_MANUAL`. | Configurables y auditados. |
| PAY-003 | Canales al llegar: efectivo y QR, habilitables por gestión/caja. | Cajero solo usa canales activos. |
| PAY-004 | Evidencia registra monto, moneda, fecha, banco/plataforma, referencia, pagador y archivo privado. | Archivo no público; checksum. |
| PAY-005 | Subir evidencia no confirma el pago. | Solo `APPROVED` crea/confirma pago y asignación. |
| PAY-006 | Revisión registra aprobador, fecha, resultado y motivo. | Auditoría completa. |
| PAY-007 | Referencia duplicada se bloquea o marca para revisión. | `PAYMENT_DUPLICATE`. |
| PAY-008 | Un pago puede asignarse parcial o totalmente a cargos. | Saldo calculado, nunca editado manualmente. |
| PAY-009 | Cada pago aprobado genera un Comprobante de pago. | Un pago parcial produce su propio comprobante. |
| PAY-010 | Secuencia: `REC-{EVENT_CODE}-{NNNNNN}` única por gestión. | Concurrencia no duplica. |
| PAY-011 | Pie del documento: “Documento de control interno”. | Validación visual/PDF. |
| PAY-012 | Datos del peregrino: nombre, código de inscripción y paquete. | No incluye documento ni país. |
| PAY-013 | QR público verifica validez, número, evento, fecha, monto, moneda y estado sin PII. | Cualquier cámara abre la URL. |
| PAY-014 | Detalle completo requiere autenticación y `receipt.read_sensitive`. | Acceso anónimo no expone PII. |
| PAY-015 | El comprobante emitido es inmutable; corrección por anulación y nueva emisión. | Original permanece `VOID`. |
| CASH-001 | Todo cobro presencial ocurre en una sesión de caja abierta. | Sin sesión falla. |
| CASH-002 | Cierre compara esperado y contado por moneda/canal. | Diferencia exige motivo. |

## 8. Hospedaje

| ID | Requisito | Criterio |
|---|---|---|
| HOS-001 | La gestión configura cantidad fija de noches y fechas de hospedaje. | Referencia actual 7 noches, modificable. |
| HOS-002 | La llegada tardía no reduce automáticamente el rango ni el precio. | `actual_arrival_at` no reescribe reserva. |
| HOS-003 | Una reserva `CONFIRMED` no se libera por ausencia al inicio. | Worker no la expira por no-show. |
| HOS-004 | `HELD` puede expirar únicamente según DEC-005. | Sin DEC-005 no se fija duración productiva. |
| HOS-005 | El anticipado aprobado habilita elegir hotel según disponibilidad. | Selección transaccional. |
| HOS-006 | Pago al llegar no reserva hotel anticipadamente. | Hotel se elige entre disponibilidad restante. |
| HOS-007 | La habitación la asigna Hospedaje. | Permiso y auditoría. |
| HOS-008 | Capacidad se controla por inventario/rango, no por contador desincronizable. | Prueba de último cupo concurrente. |

## 9. Alimentos y materiales

| ID | Requisito | Criterio |
|---|---|---|
| FOOD-001 | Alimentos configura servicios por fecha, tipo, hora inicial/final y cantidad disponible. | `ends_at > starts_at`. |
| FOOD-002 | QR valida gestión, beneficio, fecha, horario, disponibilidad y duplicidad. | Fuera de ventana se rechaza. |
| FOOD-003 | Pedido, recepción, desperdicio y entrega son movimientos separados. | Reporte reconciliable. |
| FOOD-004 | Una persona recibe una vez cada servicio salvo override autorizado. | Constraint/idempotencia. |
| MAT-001 | Elegibilidad de materiales depende de paquete, inventario e historial. | No depende de actividad pasada. |
| MAT-002 | La llegada tardía no elimina automáticamente el material incluido. | Prueba día final. |
| MAT-003 | Entradas, salidas, ajustes, pérdidas y entregas son reconstruibles. | Stock deriva de movimientos. |

## 10. Seguridad, archivos, auditoría y no funcionales

- RBAC con scopes global, gestión, comisión y caja.
- PII enmascarada; evidencias y PDFs privados con URL firmada cuando corresponda.
- Tokens de QR almacenados por hash; no contienen PII.
- Montos usan decimal exacto, nunca `float`.
- Fechas se guardan en UTC y se muestran en la zona horaria de la gestión.
- Objetivo operativo: 99,9% durante la ventana del evento, sujeto a DEC-012.
- WCAG 2.2 AA en flujos críticos; viewports 390, 768, 1280, 1440 y 1920 px.
- Idempotencia y concurrencia obligatorias para pago, cupo, entrega, cierre y sincronización offline.

## 11. Decisiones

DEC-001 a DEC-004 están `APPROVED`. DEC-005 a DEC-017 permanecen en `docs/04-delivery/decision-register.md`.
