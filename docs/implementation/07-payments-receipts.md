# P07 — Pagos manuales, cajas y comprobantes

**Fecha:** 5 de agosto de 2026
**Alcance:** PAY-002, PAY-014, PAY-018, PAY-022, PAY-023, PAY-024, PAY-025, PAY-026, PAY-027, PAY-028, PAY-029, PAY-030, PAY-031, PAY-032, PAY-033, PAY-011, PAY-012, y DEC-003, DEC-007, DEC-008, DEC-009, DEC-015.

## 1. Gate ejecutado

| Paso | Comando | Exit |
|---|---|---:|
| Validador documental · Formato · Lint · Typecheck | | 0 |
| Unitarias | `pnpm test` — **218 pruebas** | 0 |
| **Integración** | `pnpm test:integration` — **74 pruebas** | 0 |
| Build · Accesibilidad | | 0 |

## 2. Lo que no existe, y es lo importante

PAY-022 y DEC-002 excluyen el checkout automático de v1. DEC-015 cerró además el alcance de una integración con QR bancario. En consecuencia, en este módulo **no hay** tabla de proveedores, ni webhooks, ni callbacks, ni SDK de pasarela.

Un pago existe por una sola razón: una persona autorizada aprobó una evidencia, o cobró en caja. El QR de Bolivia es el medio por el que el peregrino transfiere, no un sistema que confirme por su cuenta. Los tres canales anticipados llevan el sufijo `_MANUAL` en su propio nombre, y una prueba lo verifica.

## 3. Inmutabilidad financiera

`payments` y `payment_allocations` rechazan `UPDATE` y `DELETE` por trigger. Una corrección se hace por reversión o anulación, nunca reescribiendo la fila (GOV-005).

`receipts` tiene un trigger más fino: **solo admite la anulación**. Comparar campo a campo permite que se rellenen `voided_at`, `voided_by` y `void_reason`, y rechaza cualquier cambio en número, secuencia, snapshot, token o fecha de emisión. Un comprobante ya anulado no admite más cambios.

Además:

- Anular exige motivo y responsable. Un comprobante anulado sin explicación no serviría para auditar nada.
- `receipts_number_matches_sequence` obliga a que el número termine en la secuencia con relleno a seis dígitos. Sin ese `CHECK`, un fallo de formato produciría dos comprobantes con números distintos y la misma secuencia.

## 4. Concurrencia en la secuencia

PAY-014 exige `REC-{EVENT_CODE}-{NNNNNN}` único **por gestión**. La secuencia se cuenta dentro de la transacción y el índice único `(event_id, sequence)` decide la carrera.

Verificado con cinco emisiones simultáneas: las que colisionan fallan, y **ningún número ni secuencia se repite**. Verificado también que dos gestiones distintas empiezan cada una en 1 sin interferir.

## 5. Verificación pública sin PII

El token de verificación se almacena **por hash**. El valor en claro solo existe dentro del QR impreso; la base no puede devolverlo aunque alguien la consulte entera. La verificación funciona buscando por hash, que es lo que hace el endpoint público.

El snapshot del comprobante contiene nombre, código de inscripción y paquete —lo que PAY-030 autoriza— y una prueba comprueba que **no** contiene documento ni país.

La proyección pública `toPublicReceiptVerification`, escrita en P02, sigue siendo la única forma en que un comprobante sale al exterior.

## 6. Reglas que la base impone y el código no puede saltarse

| Invariante | Requisito |
|---|---|
| Aprobar, rechazar o pedir corrección exige revisor y fecha | PAY-026 |
| Rechazar o pedir corrección exige motivo; aprobar no | PAY-026 |
| Referencia bancaria única por gestión | PAY-027 |
| Un cobro en efectivo o QR de caja exige sesión de caja | PAY-011 |
| Cerrar caja exige esperado, contado, y motivo si difieren | PAY-012 |
| Importes estrictamente positivos | §10 |

## 7. Dinero y tasa de cambio

La tasa se guarda en **millonésimas** y se congela al cargar la evidencia (DEC-009). Dividir en coma flotante justo donde se convierte dinero es la clase de error que reaparece como un céntimo de descuadre en el cierre de caja.

**Declarado y contabilizado son dos cifras distintas, y conviene no volver a confundirlas.** El declarado es lo que la persona transfirió, en la moneda del canal: es lo que dice su extracto bancario y no cambia nunca. El contabilizado es lo que la organización registra haber cobrado, en la moneda funcional de los libros —bolivianos—, y es lo que baja el saldo, lo que se reparte entre cargos y lo que cuenta el arqueo.

La conversión ocurre en **un solo punto**: `requireBookedAmount`, al aprobar. Hasta el 13 de agosto de 2026 no ocurría en ninguno. `findForReview` devolvía el importe declarado bajo el nombre `amount` y con un comentario que afirmaba que ya venía convertido; aprobar un cobro en dólares contra cargos en bolivianos o bien reventaba comparando monedas, o bien —sin reparto, que es el sobrepago de DEC-008— creaba un pago con el número del dólar y la etiqueta del boliviano. Cincuenta dólares pasaban a valer cincuenta bolivianos sin que nada fallara.

Una evidencia multimoneda **sin** tasa congelada no es aprobable: `EXCHANGE_RATE_MISSING`. Existen —las cargadas antes de que hubiera registro diario de tasas— y su remedio no es evidente, así que el mensaje lo dice: registrar la tasa ahora no rellena una evidencia ya cargada, hay que registrarla y pedir corrección para que se congele al reenviar.

El comprobante guarda **las dos cifras y la tasa**. PAY-030 lo hace inmutable, así que lo que no se escriba al emitirlo no se añade después; un comprobante que solo dijera «348.00 BOB» a quien envió cincuenta dólares no se parece a nada que esa persona pueda reconocer.

El saldo se **deriva** de las asignaciones; no hay ninguna columna de saldo que alguien pueda escribir. Es lo que PAY-002 pide, y también lo que hace que el arqueo sea un control real y no una declaración.

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
