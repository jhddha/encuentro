# P07 — Pagos manuales, cajas y comprobantes

**Fecha:** 5 de agosto de 2026
**Alcance:** PAY-001..015, CASH-001..002, y DEC-003, DEC-007, DEC-008, DEC-009, DEC-015.

## 1. Gate ejecutado

| Paso | Comando | Exit |
|---|---|---:|
| Validador documental · Formato · Lint · Typecheck | | 0 |
| Unitarias | `pnpm test` — **218 pruebas** | 0 |
| **Integración** | `pnpm test:integration` — **74 pruebas** | 0 |
| Build · Accesibilidad | | 0 |

## 2. Lo que no existe, y es lo importante

PAY-001 y DEC-002 excluyen el checkout automático de v1. DEC-015 cerró además el alcance de una integración con QR bancario. En consecuencia, en este módulo **no hay** tabla de proveedores, ni webhooks, ni callbacks, ni SDK de pasarela.

Un pago existe por una sola razón: una persona autorizada aprobó una evidencia, o cobró en caja. El QR de Bolivia es el medio por el que el peregrino transfiere, no un sistema que confirme por su cuenta. Los tres canales anticipados llevan el sufijo `_MANUAL` en su propio nombre, y una prueba lo verifica.

## 3. Inmutabilidad financiera

`payments` y `payment_allocations` rechazan `UPDATE` y `DELETE` por trigger. Una corrección se hace por reversión o anulación, nunca reescribiendo la fila (GOV-005).

`receipts` tiene un trigger más fino: **solo admite la anulación**. Comparar campo a campo permite que se rellenen `voided_at`, `voided_by` y `void_reason`, y rechaza cualquier cambio en número, secuencia, snapshot, token o fecha de emisión. Un comprobante ya anulado no admite más cambios.

Además:

- Anular exige motivo y responsable. Un comprobante anulado sin explicación no serviría para auditar nada.
- `receipts_number_matches_sequence` obliga a que el número termine en la secuencia con relleno a seis dígitos. Sin ese `CHECK`, un fallo de formato produciría dos comprobantes con números distintos y la misma secuencia.

## 4. Concurrencia en la secuencia

PAY-010 exige `REC-{EVENT_CODE}-{NNNNNN}` único **por gestión**. La secuencia se cuenta dentro de la transacción y el índice único `(event_id, sequence)` decide la carrera.

Verificado con cinco emisiones simultáneas: las que colisionan fallan, y **ningún número ni secuencia se repite**. Verificado también que dos gestiones distintas empiezan cada una en 1 sin interferir.

## 5. Verificación pública sin PII

El token de verificación se almacena **por hash**. El valor en claro solo existe dentro del QR impreso; la base no puede devolverlo aunque alguien la consulte entera. La verificación funciona buscando por hash, que es lo que hace el endpoint público.

El snapshot del comprobante contiene nombre, código de inscripción y paquete —lo que PAY-012 autoriza— y una prueba comprueba que **no** contiene documento ni país.

La proyección pública `toPublicReceiptVerification`, escrita en P02, sigue siendo la única forma en que un comprobante sale al exterior.

## 6. Reglas que la base impone y el código no puede saltarse

| Invariante | Requisito |
|---|---|
| Aprobar, rechazar o pedir corrección exige revisor y fecha | PAY-006 |
| Rechazar o pedir corrección exige motivo; aprobar no | PAY-006 |
| Referencia bancaria única por gestión | PAY-007 |
| Un cobro en efectivo o QR de caja exige sesión de caja | CASH-001 |
| Cerrar caja exige esperado, contado, y motivo si difieren | CASH-002 |
| Importes estrictamente positivos | §10 |

## 7. Dinero y tasa de cambio

La tasa se guarda en **millonésimas** y se congela al cargar la evidencia (DEC-009). Dividir en coma flotante justo donde se convierte dinero es la clase de error que reaparece como un céntimo de descuadre en el cierre de caja.

El saldo se **deriva** de las asignaciones; no hay ninguna columna de saldo que alguien pueda escribir. Es lo que PAY-008 pide, y también lo que hace que el arqueo sea un control real y no una declaración.

DEC-007 y DEC-008: no se devuelve dinero. `creditFromOverpayment` convierte el saldo negativo en saldo a favor positivo, y devuelve cero cuando no hay sobrepago — un «saldo a favor negativo» no significa nada.

## 8. Qué NO se implementó, y por qué

| Omisión | Motivo |
|---|---|
| Casos de uso de aprobación y cobro | El esquema, las invariantes y el dominio están completos y probados; falta el orquestador en `packages/application` que los ate. |
| Pantallas de pagos, comprobantes y caja | Las rutas existen desde P02. |
| Generación del PDF | DEC-010 dejó el tamaño configurable y pendiente del equipo de impresión. |
| Endpoint público de verificación conectado | La página existe desde P02 y devuelve `unavailable`; falta apuntarla al repositorio. |

**Los estados `REFUNDED` y `PARTIALLY_REFUNDED` permanecen en el contrato pero sin flujo productivo**, porque DEC-007 excluye las devoluciones de v1.

## 9. Riesgos y pendientes

1. **Falta la capa de aplicación.** Las pruebas de integración construyen los pagos directamente sobre Prisma, replicando lo que hará el caso de uso. Las invariantes están verificadas, pero el orquestador que las use aún no existe.
2. **El endpoint público de verificación sigue devolviendo `unavailable`.** Conectarlo es trabajo pequeño y de alto valor: es la única superficie sin sesión.
3. **`payment_channels` admite scope global o por gestión**, pero no hay regla documentada sobre cuál corresponde a cada canal. Se dejó configurable con `scope` por defecto `EVENT`.
