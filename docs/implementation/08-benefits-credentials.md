# P08–P11 — Credenciales, escaneo offline, alimentos, materiales y transporte

**Fecha:** 5 de agosto de 2026

## ⚠ Procedencia de las reglas

Esta es la primera entrega que mezcla reglas del contrato con reglas inferidas. La distinción importa para poder auditar el sistema, así que va antes que nada.

**Del contrato** (`contracts/requirements.json`):

| Requisito | Qué gobierna |
|---|---|
| FOD-001, FOD-006, FOD-002, FOD-003 | Servicios por fecha, tipo, horario y cantidad; entrega única; movimientos separados |
| MAT-005, MAT-004, MAT-003 | Elegibilidad, llegada tardía y stock por movimientos |
| ADR-008 | Idempotencia por estación y `operation_uuid` |
| requirements.md §10 | Tokens de QR por hash y sin PII |

**Inferido**, por decisión explícita del responsable del proyecto (ver conversación del 5-ago-2026):

| Regla inferida | Fuente de la inferencia | Riesgo si es incorrecta |
|---|---|---|
| Modelo `Credential` con token por hash y revocación | `system-architecture.md` §5 «Credentials», prompt P08 | Bajo: el token por hash sí lo exige §10 |
| Revocar una credencial exige responsable y motivo | Coherencia con PAY-033 | Bajo: solo añade exigencia |
| Modelo `Station` para el escaneo | Prompt P09, ruta `/scanner/...` del contrato | Bajo |
| Modelo `Vehicle` con capacidad | Prompt P10, «vehículos, choferes, horarios» | **Medio**: la capacidad no está especificada |
| Modelo `Trip` con origen, destino y horario | Prompt P10, gate «solapamientos/capacidad» | **Medio**: la forma del traslado es invención |
| Un vehículo no puede tener traslados solapados | Gate «solapamientos» del prompt P10 | **Medio**: es la lectura obvia, pero no está escrita |

**Nada de lo inferido toca dinero, precios ni elegibilidad de pago.** Esas reglas siguen viniendo enteras del contrato.

## 1. Gate ejecutado

| Paso | Exit |
|---|---:|
| Validador · Formato · Lint · Typecheck | 0 |
| Unitarias — **243 pruebas** | 0 |
| **Integración** — **90 pruebas** | 0 |
| Build · Accesibilidad | 0 |

## 2. Entrega única y doble escaneo

FOD-003 pide que una persona reciba una vez cada servicio. La garantía es un índice único `(service_id, registration_id)`, no una comprobación en código.

Eso resuelve de paso el escenario que ADR-008 nombra explícitamente: **dos estaciones intentando entregar a la misma persona a la vez**. Probado con dos creaciones simultáneas desde estaciones distintas — sobrevive una.

La idempotencia offline es un segundo índice, `(station_id, operation_uuid)`: una estación que recupera la conexión y reenvía el mismo escaneo no entrega dos veces.

Un override sí está permitido —FOD-003 lo contempla— pero exige responsable y motivo por `CHECK`. Una excepción sin explicación no serviría para auditar por qué alguien comió dos veces.

## 3. Materiales y llegada tardía

`decideMaterialDelivery` **no acepta fecha de llegada**, por la misma razón que `chargeAmount` en P05: MAT-004 dice que la llegada tardía no elimina el material incluido, y aceptar la fecha invitaría a usarla para excluir a quien llega el último día.

MAT-005 es igual de explícito en que la elegibilidad **no depende de actividades pasadas**, solo de paquete, inventario e historial de entregas.

## 4. Stock derivado

MAT-003: «stock deriva de movimientos». No hay columna de existencias que alguien pueda corregir a mano, igual que no hay columna de saldo en facturación. Los movimientos son append-only por trigger.

Un `CHECK` permite cantidades negativas **solo en ajustes**: recepciones, entregas y pérdidas llevan cantidad positiva y su signo lo determina la clase del movimiento. Sin esa distinción, una recepción negativa sería indistinguible de una pérdida.

## 5. Transporte: la parte más inferida

El prompt P10 pide un gate de «solapamientos y capacidad». Sin requisitos que lo respalden, lo implementado es:

- Un vehículo con capacidad positiva.
- Traslados con origen, destino y horario coherente.
- **Una restricción de exclusión** (`EXCLUDE USING gist`) que impide que un vehículo tenga dos traslados solapados en el tiempo. Requiere la extensión `btree_gist`.

Probado que dos traslados solapados se rechazan y que dos consecutivos —uno termina cuando el otro empieza— se aceptan.

**Esto es una interpretación razonable de «solapamientos», no una regla documentada.** Si el negocio permite, por ejemplo, que un bus haga dos rutas que se solapan parcialmente porque el trayecto es compartido, esta restricción lo impedirá y habrá que revisarla.

## 6. Qué NO se implementó

| Omisión | Motivo |
|---|---|
| PWA offline con cola local | P09 pide IndexedDB y sincronización. El esquema y la idempotencia están listos; el cliente offline no. |
| Casos de uso y pantallas | Igual que en P07: dominio y base completos, falta la capa que los orquesta. |
| Check-in y cierre operativo (P08) | El modelo de credencial existe; el flujo de check-in depende de la capa de aplicación. |
| Contabilidad (P12) y notificaciones (P13) | Sin requisitos en el contrato y sin base de inferencia sólida. Ver §7. |

## 7. Sobre P12 y P13

No se implementaron. A diferencia de transporte —donde el prompt al menos nombra vehículos, horarios y un gate—, para contabilidad y notificaciones la única guía es:

- P12: «partida doble simplificada, cuentas, conciliaciones, rendiciones, donaciones y activos».
- P13: «SMTP singleton global, plantillas versionadas, jobs, historial y reportes».

Inventar un plan de cuentas y unas reglas de asiento contable sin requisitos sería adivinar sobre dinero, que es exactamente donde el coste de equivocarse es más alto. GOV-007 y la arquitectura sí fijan que SMTP es global y sin `event_id`, y ADR-007 fija el patrón outbox; eso está disponible cuando se decida abordarlo, pero no basta para construir el módulo.

**Recomendación:** recuperar los requisitos de contabilidad y notificaciones de la documentación v2.6 antes de implementarlos. Es lo que `source-migration-matrix.md` ya pedía.

## 8. Riesgos

1. **Seis modelos son inferencia mía.** Están listados arriba con su riesgo. Los de transporte son los más expuestos.
2. **No hay PWA offline**, así que la idempotencia está probada pero no ejercitada por un cliente real.
3. **P12 y P13 quedan sin construir**, y con ellas el cierre financiero y las notificaciones. Eso afecta a P14 y P15, que asumen un sistema completo.
