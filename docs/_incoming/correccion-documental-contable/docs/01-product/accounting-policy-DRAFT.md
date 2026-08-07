# Política contable propuesta — BORRADOR NO APROBADO

**Estado:** `PROPOSED_NOT_APPROVED`  
**Alcance:** contabilidad administrativa y control financiero del evento  
**No sustituye:** libros fiscales, declaraciones tributarias ni contabilidad legal de la institución

## 1. Objetivo

Definir de manera verificable qué operaciones del sistema generan asientos, en qué momento se reconocen, qué roles contables participan y cómo se revierten. El motor contable no debe inferir estas reglas desde nombres de pantallas, tablas o estados técnicos.

## 2. Base de reconocimiento propuesta

Se propone una **base de efectivo modificada**:

- La creación de cargos, reservas, inscripciones o solicitudes no genera asiento por sí sola.
- El ingreso se reconoce cuando un pago está confirmado y aplicado a un concepto válido.
- Un pago confirmado todavía no aplicado se registra como anticipo o saldo a favor, no como ingreso.
- Una compra pendiente puede reconocer una cuenta por pagar cuando haya obligación aprobada y documento suficiente.
- Un desembolso a una comisión o responsable se registra como anticipo por rendir; no es gasto hasta aprobar la rendición.
- Las donaciones en especie y servicios se registran como movimientos no monetarios cuando exista valoración y aprobación.
- El inventario se reconoce al ingresar y se descarga al consumir, perder, desperdiciar o transferir.
- No se calcula depreciación automática en la primera versión, salvo decisión posterior.
- No se realiza conversión automática de moneda hasta aprobar una política multimoneda.

## 3. Principios obligatorios

1. **Partida doble:** todo asiento contabilizado debe cuadrar.
2. **Inmutabilidad:** un asiento contabilizado no se edita; se corrige mediante reversión y nuevo asiento.
3. **Idempotencia:** una misma fuente no puede generar dos veces el mismo tipo de asiento.
4. **Trazabilidad:** cada asiento debe conservar origen, usuario, evento, fecha, regla y versión.
5. **Configuración:** las reglas usan roles contables; los números de cuenta se resuelven desde el plan de cuentas del evento.
6. **Aprobación:** solo estados de negocio aprobados o confirmados pueden disparar contabilización.
7. **Separación:** la operación de negocio y el asiento deben estar vinculados, pero no fusionados en una sola tabla o entidad.
8. **Reversión explícita:** cada regla debe definir cómo se revierte.

## 4. Roles contables mínimos propuestos

- `CASH_ON_HAND`
- `BANK_ACCOUNT`
- `QR_CLEARING`
- `PAYMENT_GATEWAY_CLEARING`
- `REGISTRATION_REVENUE`
- `LODGING_REVENUE`
- `TRANSPORT_REVENUE`
- `MONETARY_DONATION_REVENUE`
- `IN_KIND_DONATION_REVENUE`
- `PARTICIPANT_ADVANCES`
- `ACCOUNTS_PAYABLE`
- `STAFF_REIMBURSEMENTS_PAYABLE`
- `ADVANCES_TO_ACCOUNT_FOR`
- `INVENTORY`
- `FIXED_ASSETS`
- `OPERATING_EXPENSE`
- `FOOD_AND_MATERIALS_EXPENSE`
- `LOSS_AND_WASTE_EXPENSE`
- `PAYMENT_PROCESSING_FEES`
- `RECONCILIATION_DIFFERENCES`

## 5. Matriz propuesta de contabilización

| Operación confirmada | Débito | Crédito | Condición principal |
|---|---|---|---|
| Pago aplicado a inscripción | Caja, banco o cuenta financiera | Ingreso por inscripciones | Pago confirmado y asignación aprobada |
| Pago aplicado a hospedaje | Caja, banco o cuenta financiera | Ingreso por hospedaje | Pago confirmado y asignación aprobada |
| Pago aplicado a transporte | Caja, banco o cuenta financiera | Ingreso por transporte | Pago confirmado y asignación aprobada |
| Pago recibido todavía no aplicado | Caja, banco o cuenta financiera | Anticipos o saldos a favor | Pago confirmado sin asignación final |
| Aplicación posterior de anticipo | Anticipos o saldos a favor | Ingreso correspondiente | Asignación aprobada; no mueve efectivo nuevamente |
| Donación monetaria | Caja o banco | Ingreso por donaciones monetarias | Donación recibida y confirmada |
| Donación en especie consumible | Inventario | Ingreso por donaciones en especie | Valoración y recepción aprobadas |
| Servicio recibido como donación | Gasto del servicio | Ingreso por donaciones en especie/servicios | Valoración y aceptación aprobadas |
| Compra pagada inmediatamente | Gasto, inventario o activo | Caja o banco | Compra aprobada y pagada |
| Compra pendiente | Gasto, inventario o activo | Cuentas por pagar | Obligación aprobada y documento suficiente |
| Pago posterior a proveedor | Cuentas por pagar | Caja o banco | Pago confirmado |
| Desembolso a responsable | Anticipos por rendir | Caja o banco | Entrega confirmada |
| Gasto aprobado en rendición | Gasto, inventario o activo | Anticipos por rendir | Rendición aprobada |
| Devolución de saldo no utilizado | Caja o banco | Anticipos por rendir | Devolución confirmada |
| Gasto propio aprobado | Gasto correspondiente | Cuenta por pagar al responsable | Reembolso aprobado |
| Pago del reembolso | Cuenta por pagar al responsable | Caja o banco | Pago confirmado |
| Consumo de inventario | Gasto de alimentos/materiales | Inventario | Salida aprobada |
| Desperdicio o pérdida | Gasto por desperdicio/pérdida | Inventario | Ajuste aprobado con evidencia |
| Transferencia entre cuentas | Cuenta financiera de destino | Cuenta financiera de origen | Transferencia conciliada |
| Liquidación de pasarela | Banco y gasto por comisión | Cuenta transitoria de pasarela | Liquidación confirmada |
| Diferencia de conciliación aprobada | Diferencia de conciliación o cuenta definida | Cuenta financiera/transitoria | Ajuste aprobado |
| Reversión | Líneas inversas del asiento original | Líneas inversas del asiento original | Referencia obligatoria al asiento original |

## 6. Operaciones que no generan asiento por sí solas

- Creación o edición de participante.
- Creación de inscripción.
- Generación de cargo o estado de cuenta.
- Reserva de hospedaje sin pago reconocido.
- Registro preliminar de compra no aprobada.
- Rendición en borrador o enviada, pero no aprobada.
- Donación prometida, no recibida.
- Movimiento de inventario en borrador.
- Conciliación en borrador.
- Cambio de estado puramente técnico sin efecto económico.

## 7. Pagos parciales, saldos a favor y sobrepagos

- Cada aplicación parcial genera reconocimiento únicamente por el importe aplicado.
- El remanente confirmado queda en `PARTICIPANT_ADVANCES` hasta aplicación o devolución.
- El sobrepago no se reconoce como ingreso adicional.
- La devolución de un saldo a favor debe cancelar el pasivo y acreditar la cuenta financiera.
- Las reglas definitivas de devolución, compensación entre conceptos y caducidad requieren decisión aprobada.

## 8. Rendiciones y reembolsos

- El desembolso inicial es un activo por rendir.
- La aprobación de comprobantes convierte el anticipo en gasto, inventario o activo según la naturaleza.
- La devolución de efectivo reduce el anticipo pendiente.
- Si el responsable gastó recursos propios y la rendición es aprobada, se reconoce una cuenta por pagar al responsable.
- Diferencias no justificadas deben permanecer bloqueadas o en investigación; no deben convertirse automáticamente en gasto.

## 9. Inventarios y activos

- Los inventarios comprados se reconocen al costo aprobado.
- Los inventarios donados requieren valoración aprobada y se marcan como no monetarios.
- Consumo, pérdida, desperdicio y sobrante requieren tipos de movimiento diferentes.
- Los activos comprados o donados se reconocen con trazabilidad; la depreciación queda fuera del alcance inicial.

## 10. Reversiones, cierre e idempotencia

- La llave propuesta es `event_id + source_type + source_id + entry_kind + rule_version`.
- Un asiento contabilizado se revierte mediante otro asiento; nunca se sobrescriben líneas.
- El periodo cerrado no acepta contabilizaciones ordinarias. Ajustes posteriores requieren periodo de ajuste o reapertura autorizada.
- Toda reversión debe indicar motivo, usuario autorizador y asiento original.

## 11. Decisiones bloqueantes

- Política multimoneda y tipo de cambio.
- Tratamiento definitivo de sobrepagos y devoluciones.
- Cierre, reapertura y periodos de ajuste.
- Plan de cuentas mínimo definitivo.
- Umbrales y responsables de aprobación.
- Valoración de donaciones en especie y servicios.

## 12. Criterio de aprobación

Esta política solo puede pasar a `APPROVED` cuando la matriz, los roles contables, los estados disparadores, las reversiones y las decisiones bloqueantes hayan sido revisados por Administración/Contabilidad y aceptados en un DEC definitivo.
