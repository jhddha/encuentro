# Revisión de la rama `migracion-linea-base-v2.6`

**Fecha:** 8 de agosto de 2026  
**Alcance:** los quince commits sobre `main` (`626ad05`) — 166 archivos, ~16.600 líneas.  
**Método:** siete revisores independientes por subsistema y un verificador por hallazgo con el encargo de refutarlo. **41 hallazgos, 33 sobrevivieron.**

El gate estaba en verde cuando se hizo esta revisión: validador, prettier, ESLint, `tsc`, 418 unitarias, 163 de integración y `pnpm build`. Ninguno de los 33 lo detecta.

> Verifiqué a mano los tres primeros de la sección A. El resto procede de la revisión y está pendiente de comprobación individual antes de corregirse.


## A. Seguridad y dinero — bloquean la fusión

### [ALTA] La pantalla de auditoría no comprueba `audit.read`: cualquier peregrino autenticado lee el rastro completo de cualquier gestión

`apps/web/src/app/admin/e/[eventCode]/auditoria/page.tsx:19`

**Qué está mal.** `docs/02-architecture/data-api-rbac.md:152` exige `audit.read` para Auditoría. La página nunca llama a `requirePermission`: resuelve la gestión por su código y lanza `prisma().auditLog.findMany({ where: { eventId: event.id } })` sin ninguna comprobación de permiso ni de scope. La única barrera es `apps/web/src/app/admin/layout.tsx`, que solo hace `await requireActor()` — es decir, *autenticación*, y su propio comentario lo dice en voz alta («esto garantiza *autenticación*… la *autorización* la exige cada acción con `requirePermission`»). No existe middleware (`find apps/web -name middleware*` solo devuelve artefactos de `.next`), y `apps/web/src/app/admin/e/[eventCode]/layout.tsx` únicamente pinta navegación. `requireActor` exige sesión, correo verificado y MFA *solo* si `actor.assignments.length > 0`, así que una cuenta de peregrino —cero asignaciones, cero permisos, sin segundo factor— la atraviesa entera. La respuesta expone `actor.displayName` (PII), `beforeRedacted`/`afterRedacted` (importes, referencias bancarias, `paymentId`, `channelId`, códigos de inscripción) y `reason` (texto libre del revisor). Es escalada vertical de privilegio contra GOV-005/GOV-006 y contra la regla 03-security-rbac. La rama agrava el impacto: antes casi no se escribía en `audit_logs`, y estos quince commits empiezan a volcar ahí el circuito de pagos. Mismo patrón, menor gravedad, en `admin/e/[eventCode]/configuracion/page.tsx`, `admin/e/[eventCode]/dashboard/page.tsx` y `admin/eventos/page.tsx`, que también leen de base sin `requirePermission` (compárese con `comprobantes/page.tsx:68` e `inscripciones/page.tsx:64`, que sí lo hacen).

**Cómo falla.** Un peregrino se registra en el portal público, verifica su correo e inicia sesión. No tiene ninguna `role_assignment`, así que `requireActor` ni siquiera le pide MFA. Navega a `/admin/e/ENC2026/auditoria` y recibe las últimas 100 entradas de auditoría de la gestión: nombres de quienes aprobaron pagos, referencias bancarias, importes y los motivos de rechazo escritos por tesorería. Cambiando `ENC2026` por otro código repite la lectura en cualquier otra gestión.

### [ALTA] El reparto se valida contra un saldo leído fuera de la transacción y approve() no lo revalida: la carrera no se rechaza

`packages/infrastructure/src/payment-proof-repository.ts:384`

**Qué está mal.** El criterio de aceptación de PAY-020 en docs/01-product/requirements.md:150 es literal: «La transacción rechaza la carrera». Aquí el saldo pendiente de cada cargo se calcula en `findForReview` (líneas 253-282), fuera de toda transacción; el caso de uso valida contra ese número y `approve` escribe las asignaciones (línea 384) sin volver a comprobar nada. El `pg_advisory_xact_lock(hashtext(eventId))` de la línea 355 serializa las aprobaciones de la gestión, pero solo protege la numeración del comprobante: la segunda transacción espera y luego escribe igualmente el reparto que calculó con datos previos al bloqueo. No hay CAS sobre los cargos ni constraint agregado en base. El test de concurrencia (tests/integration/payment-proof-review.test.ts:246) aprueba dos evidencias simultáneas pero solo asigna en una, así que no cubre este caso.

**Cómo falla.** Una inscripción con un cargo de 420.00 USD y dos evidencias en UNDER_REVIEW (el peregrino transfirió dos veces por error). Dos revisores abren sus paneles: ambos leen «pendiente 420.00». A aprueba asignando 420.00; B aprueba asignando 420.00 con su propio `expectedVersion`, que sigue siendo válido porque el CAS es sobre la evidencia, no sobre el cargo. Ambos pasan. Basta incluso con un solo revisor: una pestaña abierta desde antes de que un colega aprobara la otra evidencia produce el mismo resultado. El cargo queda con 840.00 asignados sobre 420.00, saldo -420.00, crédito calculado 0.00, y los triggers de inmutabilidad impiden deshacerlo.

### [ALTA] assertAllocationsWithinCharges valida cada asignación por separado: dos líneas al mismo cargo lo sobreasignan

`packages/domain/src/billing.ts:393`

**Qué está mal.** PAY-020 exige que una asignación no supere el saldo del cargo. La función recorre `allocations` una a una y compara cada importe contra `allocation.chargeOutstanding`, pero nunca agrega por `chargeId`. Si el mismo cargo aparece dos veces, cada línea pasa el filtro individualmente aunque la suma duplique el saldo pendiente. La otra mitad (`assertAllocationsWithinPayment`, línea 331) solo comprueba el total contra el importe del pago, así que no lo tapa. `packages/application/src/review-payment-proof.ts:222` construye la lista tal cual llega del comando —`outstandingOf` devuelve el mismo saldo para las dos entradas— y `payment_allocations` no tiene índice único `(payment_id, charge_id)` ni constraint agregado en base (prisma/schema.prisma:737). Los triggers `payment_allocations_no_update` / `no_delete` (migración p07) hacen que las filas mal escritas sean permanentes.

**Cómo falla.** Cargo PACKAGE de 420.00 USD pendiente; evidencia declarada por 840.00 USD, ya en UNDER_REVIEW. Se invoca directamente la acción de servidor `approveProofAction(eventCode, proofId, version, 'USD', [{chargeId: X, amount: '420.00'}, {chargeId: X, amount: '420.00'}])` — el propio código repite que el endpoint que Next genera es invocable sin pasar por el panel. `assertAllocationsWithinPayment`: 840 ≤ 840, pasa. `assertAllocationsWithinCharges`: 420 ≤ 420 dos veces, pasa. Se escriben dos filas de 420.00 contra un cargo de 420.00. Resultado: `computeBalance` da outstanding = -420.00 (OVERPAID) mientras `creditBalance` = pagos(840) − asignaciones(840) = 0.00, así que el estado de cuenta del peregrino muestra saldo a favor 0.00 sobre un sobrepago real de 420.00 (DEC-008 incumplido). Y como pagos y asignaciones son inmutables por trigger, no hay forma de corregirlo salvo tocar la base a mano.

### [ALTA] La inmutabilidad contable protege la cabecera pero no las líneas: un asiento contabilizado se puede vaciar

`deploy/db-roles.sql:134`

**Qué está mal.** ACC-003 y GOV-005 exigen que un asiento contabilizado no se edite. La migración P12 crea `accounting_append_only()` y la aplica solo a `journal_entries` (triggers `journal_entries_no_update` / `journal_entries_no_delete`). `journal_lines` no tiene ningún trigger de inmutabilidad: solo el CONSTRAINT TRIGGER diferido `journal_lines_balance`, que además hace `IF line_count = 0 THEN RETURN NULL` (prisma/migrations/20260805105854_p12_accounting_notifications/migration.sql:171), es decir, se rinde justamente cuando ya no queda ninguna línea. La segunda barrera que introduce esta rama repite el olvido: el bloque `REVOKE UPDATE, DELETE ON` enumera audit_logs, charges, inventory_movements, journal_entries, material_deliveries, meal_deliveries, payment_allocations y payments — `journal_lines` no está. El comentario inmediatamente encima dice «Los triggers ya rechazan UPDATE y DELETE en estas tablas», lo que no es cierto para las líneas. La verificación final del script solo comprueba `audit_logs`, así que la omisión no se detecta. El test de integración correspondiente (tests/integration/accounting.test.ts:225-234) prueba UPDATE y DELETE sobre `journal_entries` y nunca sobre `journal_lines`, por eso los 162 tests pasan en verde.

**Cómo falla.** Con el rol `encuentro_app`, `DELETE FROM journal_lines WHERE entry_id = '<asiento>'` borra las dos líneas de un asiento ya contabilizado: el trigger de cuadre se dispara al commit, encuentra `line_count = 0`, ejecuta `RETURN NULL` y deja pasar la transacción. Queda la cabecera inmutable con su memo «Cobro de inscripción» y cero importes; el ingreso desaparece del mayor sin dejar reversión ni rastro en `journal_entries`. La variante silenciosa es peor: `UPDATE journal_lines SET amount = 1.00 WHERE entry_id = '<asiento>'` sobre las dos líneas mantiene débito = crédito, pasa el trigger de cuadre, y reescribe un asiento de 350.00 a 1.00 — exactamente la edición que ACC-003 prohíbe. Cambiar `account_id` de una línea mueve el ingreso de una cuenta a otra con el mismo resultado.

### [ALTA] journal_lines queda sin ninguna barrera: la contabilidad sí se puede reescribir y vaciar

`deploy/db-roles.sql:134`

**Qué está mal.** La sección 4 se presenta como "defensa en profundidad" sobre las tablas append-only y revoca UPDATE/DELETE a encuentro_app en audit_logs, charges, inventory_movements, journal_entries, material_deliveries, meal_deliveries, payment_allocations y payments. `journal_lines` no está en la lista, y tampoco tiene trigger append-only: en 20260805105854_p12_accounting_notifications/migration.sql el único trigger sobre esa tabla es `journal_lines_balance`, un CONSTRAINT TRIGGER DEFERRABLE cuya función `journal_entry_must_balance()` hace `IF line_count = 0 THEN RETURN NULL` (línea 171). Es decir: borrar TODAS las líneas de un asiento pasa la comprobación por diseño, y `accounting_append_only()` solo está enganchado a `journal_entries`. Las dos barreras que GOV-005 pide (trigger + privilegio) son cero sobre la tabla que contiene los importes. `journal_entries` inmutable sin sus líneas protegidas no protege nada: el asiento queda como cáscara.

**Cómo falla.** Con la conexión de la aplicación (encuentro_app, DATABASE_URL de .env.prod.example:28), `DELETE FROM journal_lines WHERE entry_id = '<asiento de un pago aprobado>'` elimina las dos líneas; el trigger diferido evalúa line_count=0 y devuelve NULL sin excepción; la fila de journal_entries sobrevive intacta y `journal_entries_no_delete` nunca se dispara. El asiento queda con importe cero y el pago descontabilizado. Igual de grave: `UPDATE journal_lines SET amount = amount * 10` sobre debe y haber a la vez cuadra y pasa. Y el ensayo de restauración no lo detecta: deploy/restore-drill.sh:159 comprueba "todos los asientos cuadran", que da 0 descuadrados tanto en el caso borrado como en el reescrito simétricamente.

### [ALTA] El token en claro del comprobante se genera y se descarta: todo comprobante emitido nace inverificable para siempre

`packages/infrastructure/src/payment-proof-repository.ts:403`

**Qué está mal.** `createReceiptToken` devuelve `{token, hash}` (packages/infrastructure/src/receipt-token.ts:36). En la línea 405-428 solo se persiste `token.hash`; `token.token` muere en la variable local y `approve` devuelve `boolean`. Un grep sobre todo el repositorio confirma que ningún llamador recibe nunca el valor en claro. Como el hash es un HMAC-SHA256 de 32 bytes aleatorios con clave en entorno, el preimagen no es recuperable: no es un pendiente, es pérdida de datos irreversible en el mismo instante en que se registra el dinero. PAY-031 y DEC-003 exigen que el QR impreso lleve ese token opaco, y la verificación pública (apps/web/src/lib/receipt-verification.ts:26) todavía es un stub que devuelve siempre `unavailable`. Cuando se implemente, ningún comprobante emitido hasta entonces tendrá token válido.

**Cómo falla.** Se aprueba el primer pago en producción. Se crea `receipts` con `number = REC-XXX-000001` y `verification_token_hash` poblado. El peregrino pide su comprobante con QR: no existe ningún valor que codificar. Meses después se implementa `GET /public/receipts/verify/{token}`; todos los comprobantes emitidos en el intervalo son permanentemente no verificables y hay que reemitirlos, lo que PAY-033 solo permite anulando cada uno con motivo. El mismo efecto lo produce la rotación de `RECEIPT_VERIFICATION_SECRET` que docs/04-delivery/runbooks.md:148 prescribe como paso de respuesta a incidente.

### [MEDIA] El saldo del cargo se valida fuera de la transacción que aprueba, y el cerrojo de la gestión llega demasiado tarde para cubrirlo

`packages/application/src/review-payment-proof.ts:222`

**Qué está mal.** `load()` (línea 264) llama a `deps.proofs.findForReview(proofId)`, que calcula el pendiente de cada cargo con dos consultas sueltas (`payment-proof-repository.ts:250-262`), fuera de cualquier transacción. Con ese valor ya congelado en memoria, `approve()` ejecuta `assertAllocationsWithinCharges` y solo después llama a `deps.proofs.approve(...)`, que abre su propia `$transaction` y toma `pg_advisory_xact_lock(hashtext(eventId))` (`payment-proof-repository.ts:355`). El cerrojo serializa las *escrituras* —para lo que se puso, numerar comprobantes sin colisión— pero la comprobación de PAY-020 ya ocurrió antes de pedirlo y no se repite dentro. El compare-and-swap tampoco cubre el hueco: `updateMany` compara versión y estado de la **evidencia**, y en este escenario son dos evidencias distintas, cada una con su propia versión intacta. No hay ninguna restricción en base que ligue la suma de `payment_allocations` al importe del `charge`. El camino secuencial sí está protegido (una segunda aprobación relee el pendiente ya en cero y `outstandingOf` o `assertAllocationsWithinCharges` la rechazan); lo que se cuela es la concurrencia real, que es justo lo que NFR-004 obliga a probar («doble pago»).

**Cómo falla.** Una inscripción tiene un único cargo de 420.00 USD y dos evidencias en `UNDER_REVIEW` de 420.00 cada una (el peregrino transfirió dos veces por error). Dos revisores pulsan «Aprobar» a la vez: ambas peticiones ejecutan `findForReview` antes de que ninguna llegue al cerrojo, y las dos leen `outstanding = 420.00`. Las dos pasan `assertAllocationsWithinCharges`, y el cerrojo solo las pone en fila. Se escriben 840.00 en asignaciones contra un cargo de 420.00: el saldo queda en -420.00, `computeBalance` lo declara `OVERPAID` y el excedente aparece como asignación en lugar de quedar sin asignar como saldo a favor, que es exactamente lo que DEC-008 exige.

### [BAJA] El token en claro del comprobante se genera y se descarta: cada aprobación emite un QR que ya no se puede imprimir

`packages/infrastructure/src/payment-proof-repository.ts:403`

**Qué está mal.** `createReceiptToken` devuelve `{ token, hash }` y su propia documentación (`receipt-token.ts:26`) advierte que el valor en claro «solo existe aquí y en el QR impreso; no se persiste». En `approve` se consume únicamente `token.hash` (línea 411) para `verificationTokenHash`; `token.token` no se devuelve, no se encola, no se pasa a la notificación y no sale de la función. Como el almacenamiento es HMAC-SHA256 con un secreto de entorno, es irreversible por construcción: el token de un comprobante ya emitido no se puede recuperar nunca. Del otro lado, `apps/web/src/lib/receipt-verification.ts` es un stub que devuelve `{ kind: 'unavailable' }` de forma incondicional, así que el circuito de PAY-031/DEC-003 no existe todavía en ninguno de sus dos extremos. No es una vulnerabilidad —falla cerrado y la página pública no filtra nada, y `toPublicReceiptVerification` proyecta campo a campo correctamente— pero la rama ya empieza a emitir comprobantes numerados en producción cuyo QR será irrecuperable, y arreglarlo después exigirá reemitir o rotar el token de cada uno.

**Cómo falla.** Tesorería aprueba pagos durante toda la gestión y se emiten los comprobantes `REC-ENC2026-000001` en adelante, cada uno con su `verification_token_hash`. Cuando se implemente la verificación pública y haya que imprimir los QR, ninguno de esos comprobantes tendrá token en claro que codificar: habrá que generar un token nuevo y sobrescribir el hash de cada fila de una tabla pensada como inmutable (PAY-030, PAY-033).


## B. Procesos de fondo — correos que no salen o salen dos veces

### [ALTA] Un fallo de base de datos posterior a un envío exitoso reprograma el mismo correo

`packages/application/src/dispatch-notifications.ts:74`

**Qué está mal.** `await deps.notifications.markSent(...)` está dentro del mismo bloque `try` que `deps.email.send(...)` (líneas 68-75). El `catch` no distingue de dónde vino el error: trata cualquier excepción como fallo de envío, calcula `attempts + 1` y llama a `markFailed` con `retryAt`, lo que devuelve la fila a `PENDING` con `scheduled_at` futuro (notification-repository.ts:107-119). Es decir: el correo ya salió por SMTP y el sistema lo vuelve a poner en cola. NTF-008 exige explícitamente que «un evento repetido crea una sola entrega», y la tabla `notifications` no tiene ninguna clave de deduplicación ni marca de «entregado a SMTP» que permita detectarlo después. El caso no está cubierto: ninguna de las 7 pruebas de dispatch-notifications.test.ts ni de las 13 de integración simula un fallo en `markSent`.

**Cómo falla.** Un lote de 50 envíos tarda varios minutos contra un SMTP lento. A mitad del lote, el pool de Prisma agota su espera o el balanceador corta la conexión ociosa con Postgres. `sendMail` devuelve OK (el correo ya está entregado al servidor), `markSent` lanza, el `catch` lo clasifica como transitorio y programa un reintento a 1 minuto. En el siguiente tick se reenvía. Con la BD intermitente el ciclo se repite hasta agotar los 5 intentos de MAX_DELIVERY_ATTEMPTS: el peregrino recibe cinco veces el mismo comprobante de pago y la fila acaba en `FAILED`, indicando lo contrario de lo que ocurrió.

### [ALTA] Las notificaciones reclamadas en SENDING no vuelven nunca a la cola

`packages/infrastructure/src/notification-repository.ts:51`

**Qué está mal.** `claimDue` marca hasta 50 filas como `SENDING` de una sola vez, ANTES de intentar el primer envío, pero la única consulta de lectura de la cola filtra por `status = 'PENDING'` (línea 59). No existe en todo el repositorio ninguna sentencia que devuelva una fila de `SENDING` a `PENDING`, ni un reaper por antigüedad, ni un `lock_expires_at`: `grep -rn "SENDING"` solo encuentra la escritura de este archivo y la máquina de estados del dominio. El propio código lo admite en apps/worker/src/main.ts:209 («Matarlo a mitad dejaría notificaciones en `SENDING`, que ninguna consulta vuelve a tomar») y confía por entero en que el apagado sea siempre limpio, cosa que el despliegue no garantiza (deploy/docker-compose.prod.yml no fija `stop_grace_period`, así que Docker envía SIGKILL a los 10 s). Además no hace falta que muera el proceso: si `markFailed` o `markSent` lanzan a mitad del lote, `dispatchNotifications` no captura nada y las filas restantes ya están en `SENDING`.

**Cómo falla.** Se aprueban 40 pagos en una tanda; el tick de las 30 s reclama las 40 notificaciones y las pone en `SENDING`. Tras enviar 12, se despliega una versión nueva: `docker compose up -d` envía SIGTERM, `worker.close()` espera al envío en curso, pasan los 10 s de gracia por defecto y llega SIGKILL. Las 28 notificaciones restantes quedan en `SENDING` para siempre: no aparecen en ninguna consulta de la cola, no se reintentan, no cuentan como `FAILED` y no las ve el panel. Veintiocho peregrinos no reciben su comprobante y nadie se entera, porque `abandoned` fue 0.

### [MEDIA] Un SMTP colgado congela la expiración de HELD: un solo Worker con concurrency 1 sirve ambas colas

`apps/worker/src/main.ts:173`

**Qué está mal.** Los dos trabajos, `expirar-retenciones` y `enviar-notificaciones`, se registran en el mismo `Worker` con `concurrency: 1` (líneas 154-174). Solo puede ejecutarse uno a la vez. El envío no tiene cota de tiempo por ninguna parte: el adaptador de packages/infrastructure/src/email-sender.ts:60-67 crea el transporte sin `connectionTimeout`, `greetingTimeout` ni `socketTimeout`, así que rigen los valores por defecto de nodemailer, del orden de minutos por mensaje; el lote es de 50 (BATCH_LIMIT en dispatch-notifications.ts:40) y los envíos son secuenciales; y no se pasa `opts.timeout` a los trabajos de BullMQ. La consecuencia es que el proceso que sostiene DEC-005 depende de la disponibilidad de un servidor de correo con el que no tiene ninguna relación funcional. La expiración es el único mecanismo que devuelve una cama al inventario (HOS-003): la lógica está bien escrita y protegida por triple comprobación, pero puede quedar sin ejecutarse durante horas sin que nada lo señale.

**Cómo falla.** El proveedor SMTP deja de responder al saludo (no rechaza: se queda callado, el fallo típico de un bloqueo por reputación o un firewall). Hay 50 notificaciones pendientes. Cada `sendMail` consume su timeout completo antes de fallar, así que el trabajo `enviar-notificaciones` ocupa el único slot durante decenas de minutos, y al terminar el planificador ya tiene otro encolado. Mientras tanto `expirar-retenciones` no corre ni una vez: las retenciones vencidas de los últimos 45 minutos siguen en `HELD`, sus camas siguen fuera del inventario por el índice único parcial `reservations_one_person_per_bed`, y quien intenta reservar recibe «sin cupo» sobre plazas que en realidad están libres.

### [BAJA] Un worker vivo pero inerte no se distingue de uno sano: no hay healthcheck ni señal de avance

`apps/worker/src/main.ts:93`

**Qué está mal.** Las dos conexiones a Redis se crean con `maxRetriesPerRequest: null` (líneas 86-87) y su manejador de error solo escribe un log (líneas 93-95). Si Redis cae después del arranque, ioredis reintenta indefinidamente, ningún trabajo se ejecuta y el proceso no termina: `restart: unless-stopped` de deploy/docker-compose.prod.yml nunca se dispara porque el proceso no ha muerto. No hay HEALTHCHECK en deploy/Dockerfile.worker —su comentario dice que la salud «se mide por su conexión a Redis y por el avance de las colas», pero nada mide ninguna de las dos cosas— ni entrada `healthcheck` para el servicio worker en el compose. Además, los únicos avisos que emite son de camino feliz: `runExpireHeld` y `runSendMail` retornan temprano cuando no hay trabajo (líneas 111 y 143), así que el silencio en los logs es idéntico en «no había nada que hacer» y en «llevo seis horas sin poder hablar con Redis».

**Cómo falla.** Redis se queda sin memoria y deja de aceptar conexiones un viernes por la noche. El contenedor del worker sigue en estado `running` y `docker ps` lo muestra sano. Durante el fin de semana no expira ninguna retención HELD ni sale ningún correo; las camas retenidas se acumulan fuera del inventario y la cola de notificaciones crece. Nadie lo detecta hasta que un usuario reporta que no llegan los comprobantes, porque no existe ninguna señal —ni código de salida, ni healthcheck, ni log periódico de latido— que delate la parada.


## C. Rastro de auditoría

### [ALTA] Todo el rastro de auditoría de la revisión de pagos se escribe con `event_id = NULL` y desaparece de la única pantalla de auditoría

`packages/infrastructure/src/payment-proof-repository.ts:577`

**Qué está mal.** El helper `writeAudit` construye `tx.auditLog.create({ data: { actorId, action, entity: 'payment_proof', entityId, reason?, afterRedacted } })` sin `eventId`, y la columna es opcional en el esquema (`prisma/schema.prisma:277`, `eventId String?`). Sus tres llamantes son las tres operaciones sensibles del circuito: `payment.proof.take_for_review` (línea 297), `payment.proof.review` —rechazo y petición de corrección— (línea 323) y `payment.proof.approve` (línea 430), que es la que mueve dinero, crea el `Payment`, escribe las `PaymentAllocation` y emite el comprobante numerado. La pantalla de auditoría consulta `where: { eventId: event.id }`, y el índice de la tabla es `@@index([eventId, createdAt])`: esas filas no se ven ni se consultan por gestión. La omisión es un descuido puntual, no una decisión: en la misma transacción, `approve` ya tiene `proof.eventId` cargado (línea 337) y se lo pasa a `confirmIfSettled`, cuyo `auditLog.create` (línea 533) sí lo rellena. Igual lo rellenan `proof-submission-repository.ts:179/253` (carga y corrección por el peregrino), `registration-repository.ts:102` y `event-repository.ts:82/136`. Resultado: la auditoría de la gestión muestra la carga de la evidencia y la confirmación derivada de la inscripción, pero no quién la tomó, quién la rechazó ni quién aprobó el pago. GOV-005 y GOV-006 quedan incumplidos justo en la operación irreversible.

**Cómo falla.** Tesorería aprueba una evidencia de 420.00 USD. Se crean el pago, la asignación y el comprobante `REC-ENC2026-000001`. Semanas después, ante un descuadre, alguien abre `/admin/e/ENC2026/auditoria` para saber quién aprobó ese pago: la fila `payment.proof.approve` existe en `audit_logs` con `event_id` nulo y no aparece en el listado, que sí muestra la `registration.confirm` derivada. La responsabilidad de la aprobación es irrecuperable desde la interfaz y desde cualquier consulta por gestión.

### [MEDIA] La auditoría de toma, rechazo y aprobación se escribe sin eventId y no aparece en la única pantalla de auditoría

`packages/infrastructure/src/payment-proof-repository.ts:577`

**Qué está mal.** `writeAudit` crea la fila de `audit_logs` con `actorId`, `action`, `entity`, `entityId` y `afterRedacted`, pero nunca con `eventId`, que en prisma/schema.prisma:277 es opcional. Las tres acciones que mueven dinero —`payment.proof.take_for_review` (línea 297), `payment.proof.review` (línea 323) y `payment.proof.approve` (línea 430)— quedan con `event_id = NULL`. La única vista de auditoría del sistema, apps/web/src/app/admin/e/[eventCode]/auditoria/page.tsx:33, consulta `where: { eventId: event.id }`, y el índice es `@@index([eventId, createdAt])`. Los repositorios hermanos sí lo rellenan: proof-submission-repository.ts:181, registration-confirmation-repository.ts:89, y la propia `confirmIfSettled` de este mismo archivo (línea 535). PAY-026 pide auditoría completa de la revisión. El test de integración consulta por `entity`/`entityId` (payment-proof-review.test.ts:166), por eso el hueco pasa el gate.

**Cómo falla.** Un tesorero aprueba una evidencia de 3.000 USD. Al día siguiente hay que reconstruir quién autorizó ese cobro y se abre /admin/e/ENC2026/auditoria: aparecen `payment.proof.submit` y `registration.confirm`, pero no `payment.proof.approve` ni `payment.proof.take_for_review`. La fila existe en la tabla, pero es inalcanzable desde el producto y queda fuera de cualquier consulta por gestión o del índice que las soporta.


## D. La renumeración dejó cabos sueltos

### [ALTA] La matriz de migración quedó congelada en 65 requisitos y declara «no representados» 80 que ya son CANONICAL

`docs/04-delivery/requirement-migration-v2.6-to-current.md:5`

**Qué está mal.** El documento sigue con `**Estado:** EN PROCESO`, `**Referencia actual:** 65 requisitos en contracts/requirements.json` (L5) y «Requisitos vigentes en el contrato | 65» (L21), cuando el contrato tiene 163. Su propia regla de clasificación (L54) define `PENDIENTE_DE_MIGRACION` como «existe en la base y **no está representado**», pero al cruzar sus filas con `contracts/requirements.json` hay 80 identificadores clasificados así que ya son CANONICAL: REG-017, REG-009/010/011/018, QR-001..013 completo, IAM-001..012, NFR-013, NFR-014, ACC-001..016, NTF-*, TRN-001/008, SRV-001/004, PAY-006/019/020/021, EVT-007/008/012/014/015/017, HOS-005/006/014. Peor: la fila `| EVT-016 | REEMPLAZADO | EVT-007 + EVT-008 |` (L99) se escribió con los IDs de v2.7 y hoy se lee al revés, porque EVT-007 y EVT-008 designan ahora «gestión futura en DRAFT/READY» y «la clonación copia solo configuración versionada». `docs/04-delivery/source-migration-matrix.md` L20 repite el «65». Los tres archivos están en la lista `EXENTOS` de `scripts/validate_canonical_docs.py` (L66-75), así que el validador nuevo nunca los mira: los cuatro documentos que sostienen la auditoría de la renumeración son exactamente los cuatro que no se comprueban.

**Cómo falla.** Un revisor quiere confirmar qué falta por incorporar al contrato. La matriz de migración le dice que quedan 128 pendientes sobre una referencia de 65 y que REG-017 y las trece QR «no están representados»; el contrato dice que los 163 están dentro y el validador exige que cada uno tenga fase y prompt. Las dos fuentes se contradicen y ninguna comprobación automática lo detecta.

### [ALTA] El único mapa origen→destino de la renumeración declara que no se ha aplicado, en el commit que la aplica

`docs/04-delivery/requirement-renumbering-table.md:3`

**Qué está mal.** El archivo se añade en 61a2551 —el mismo commit que ejecuta las 573 sustituciones— y su cabecera dice `**Estado:** PROPUESTA — no aplicada`, con la línea 7 reforzando «**Nada de esto se ha aplicado.** Es la tabla que debe revisarse antes de tocar un solo archivo». La línea 5 declara «65 identificadores vigentes y **808 citas** en 96 archivos», cifra que no coincide con las 573 sustituciones que reporta el mensaje del commit. La sección «Procedimiento propuesto» (L124-134) sigue en futuro y su paso 7 («Archivar `requirements-candidates-v26.md`») ya se ejecutó. Es el único documento que registra qué identificador se movió a dónde, y por tanto el único punto de partida para auditar o revertir la operación.

**Cómo falla.** Tras fusionar, alguien necesita saber si `PAY-002` en un comentario es el viejo (canales anticipados) o el nuevo (asignación de pagos). Abre la tabla, lee «PROPUESTA — no aplicada» y concluye que el repositorio aún usa la numeración v2.7. Interpreta al revés todas las citas de las ocho familias con colisión origen-destino (PAY-001, PAY-002, PAY-011, PAY-012, PAY-014, HOS-001, HOS-002, HOS-003).

### [ALTA] El generador del paquete canónico quedó renumerado a ciegas y, si se ejecuta, destruye la línea base de 163 requisitos y el propio validador

`scripts/rebuild_package_v2_7.py:338`

**Qué está mal.** El commit 61a2551 aplicó la sustitución de renumeración a este script (116 líneas) pero nunca lo reconcilió con la nueva línea base. Su tabla incrustada tiene 69 filas / 68 IDs únicos: faltan 99 de los 163 canónicos, y `EVT-016` aparece DOS veces (líneas 253 y 254) con enunciados distintos — exactamente la colisión de identificadores que handoff.md §3 presenta como el hallazgo que reordenó toda la migración. El script escribe `docs/01-product/requirements.md` (fuente de verdad nº 1), deriva de ahí `contracts/requirements.json` (línea 1080-1086) y los mapas de fase/prompt, y en la línea 1238 sobrescribe `scripts/validate_canonical_docs.py` con una copia incrustada que NO tiene ninguna de las tres comprobaciones de trazabilidad que la rama añadió. Además, `pending` (línea 155) reescribiría DEC-005..DEC-018 como `BLOCKING` y devolvería DEC-016 a «Auth.js estable o alternativa», contra CLAUDE.md («DEC-001..017 están aprobadas. No queda ninguna BLOCKING»). Nada de esto lo ve el validador nuevo: su bucle de la comprobación 3 solo recorre `.ts,.tsx,.md,.json,.prisma,.sql,.mts`, y `.py` no está — mientras handoff.md §3 afirma que comprueba que «ninguna cita del repositorio apunta a un requisito inexistente».

**Cómo falla.** Alguien ejecuta `python scripts/rebuild_package_v2_7.py` para regenerar el paquete documental. requirements.md pasa de 163 a 68 requisitos, reaparece el `EVT-016` duplicado, contracts/requirements.json se regenera con 68 IDs, catorce decisiones aprobadas vuelven a BLOCKING, y el validador se sustituye por la versión anterior a la migración. Acto seguido `python scripts/validate_canonical_docs.py` imprime `OK ... 68 requirement IDs` y sale 0, porque el validador que acaba de auto-sobrescribirse ya no compara requirements.md contra el contrato ni busca citas huérfanas. El gate queda en verde sobre la línea base destruida.

### [ALTA] La renumeración partió los rangos «X-NNN..NNN»: solo movió el extremo izquierdo, en ~20 sitios

`docs/04-delivery/traceability.md:5`

**Qué está mal.** El script de 61a2551 sustituyó identificadores completos (`\bPREFIJO-NNN\b`) pero los documentos y el código escriben el alcance como rango abreviado: `FOOD-001..004`, `PAY-009..015`, `HOS-001..008`, `PKG-002/003`, `REG-006/007`. El segundo número no lleva prefijo, así que no se tocó. Resultado: rangos invertidos o que designan requisitos inexistentes. En `docs/04-delivery/traceability.md` 6 de las 8 filas quedaron rotas (`REG-019..005`, `PAY-022..003`, `PAY-028..015`, `REG-023/007`, `EVT-016/008`, `PKG-009/003`). Fuera de ahí: `prisma/schema.prisma` L303 `PKG-001..005 y REG-019..008`, L478 `HOS-011..008`, L591 `PAY-022..015, PAY-011..002`, L620 `PAY-018..007`, L755 `PAY-028..015`, L793 `FOD-001..004 y MAT-005..003`; `packages/domain/src/benefits.ts` L6; `apps/web/.../alimentos/page.tsx` L12, `.../hospedaje/page.tsx` L12, `.../materiales/page.tsx` L12; y `docs/implementation/05,06,07,08`. Contra el contrato: FOD-004, PKG-005, PAY-007, PAY-015, MAT-001, HOS-004/007/008, REG-008 NO existen. La comprobación nueva del validador («ninguna cita apunta a un requisito inexistente») no los ve: su regex es `\b([A-Z]{2,4})-\d{3}\b` y el número huérfano no tiene prefijo. Verifiqué además que la sustitución de identificadores completos sí fue correcta: reapliqué la tabla de mapeo sobre `61a2551^` y el resultado coincide byte a byte con `61a2551` en todos los archivos de código; no sobrevive ninguna doble renumeración.

**Cómo falla.** Alguien abre `traceability.md` para saber qué prueba cubre «Dos modalidades» y lee `REG-019..005`: un rango descendente que no designa nada. En `schema.prisma` L478 el comentario del módulo de hospedaje declara alcance `HOS-011..008`, que incluiría HOS-004, HOS-007 y HOS-008, retirados del contrato. En `alimentos/page.tsx` la UI muestra al operador «Servicios por fecha, horario y cantidad (FOD-001..004)» citando FOD-004, que no existe. El gate sigue en verde en los cinco casos.


## E. Documentación que ya no describe el repositorio

### [ALTA] El inventario «verificado» de la rama declara operativas tres pantallas que no mutan nada; nadie puede inscribirse

`docs/04-delivery/triage-alcance-evento.md:34`

**Qué está mal.** La tabla «Lo que ya funciona» —el documento que handoff.md §6 nombra como «Qué está construido de verdad y qué no»— dice que `/e/[eventCode]/inscripcion` es un «Formulario público de preinscripción» (línea 34) y que `/admin/eventos`, `/admin/e/…/configuracion` hacen «Alta y configuración de gestiones» (línea 37). Las tres son de solo lectura. `apps/web/src/app/e/[eventCode]/inscripcion/page.tsx` no contiene ni un `<form>`, ni `action=`, ni `'use server'`: es `PaymentModeCards` con importes literales `'—'` más un `ReadonlyState` que dice «Catálogo aún no disponible … Esta pantalla se conecta en P05». En toda la app existen exactamente tres ficheros de acción de servidor (comprobantes, inscripciones/confirmar, mi-cuenta/pagos) y ninguno crea inscripciones ni gestiones. El caso de uso `createRegistration` no tiene ningún invocador de producción. La consecuencia es que todo el circuito de pagos que construye la rama solo es alcanzable con filas sembradas por `prisma/dev-fixture.ts`, y los mensajes de commit «El peregrino ya puede pagar» (8e9cccf) y «El sistema ya registra quién está inscrito» (1e030c0) heredan la misma sobreafirmación.

**Cómo falla.** El responsable lee el triage para planificar noviembre, ve la preinscripción pública y el alta de gestiones en «Lo que ya funciona», y planifica el bloque 2 (hospedaje) sobre esa base. En producción un peregrino abre `/e/ENC2026/inscripcion`, ve dos tarjetas con precio «—» y ningún botón que envíe nada; no existe inscripción, así que `/e/ENC2026/mi-cuenta` no tiene qué mostrar y la bandeja del revisor está vacía para siempre. El bloque 1 entero está construido sobre una entrada que no existe.

### [MEDIA] 89 de 163 requisitos CANONICAL no tienen ninguna cita en código, y los informes de fase siguen negando que existan

`docs/implementation/12-accounting-notifications.md:7`

**Qué está mal.** `contracts/requirements.json` marca los 163 con el mismo `status: CANONICAL`: no hay ningún campo que distinga «declarado» de «construido». Al cruzar el contrato con todas las citas de `packages/`, `apps/`, `prisma/`, `tests/` y `scripts/`, 89 requisitos (55%) no aparecen ni una vez, con familias enteras a cero: QR 13/13, TRN 8/8, SRV 4/4, AUD 4/4, NTF 7/7, ACC 15/16, más IAM-002..009, HOS-005/006/014/015, REG-010/011/018/022, EVT-007/008/012/014/015/017, OBS-001/002 y ocho NFR. En paralelo, este informe —que se sigue distribuyendo sin modificar— afirma en L7 «Estas dos fases **no tienen ningún requisito** en `contracts/requirements.json`» y justifica sobre esa base 15 reglas inferidas, incluida «El plan de cuentas concreto | Ninguna. No se define ninguno», cuando ACC-001..016 y NTF-001..015 ya están en el contrato y gobiernan justamente eso. El mismo patrón en `docs/implementation/08-benefits-credentials.md` L11-27, que declara «inferido» lo que hoy cubren QR-001..013 y SRV-001..004.

**Cómo falla.** El gate del `execution-plan` (§3 Definition of Done, §6 Go/no-go) se apoya en el contrato y en los informes de fase. El contrato dice que las 13 QR y las 8 TRN son canónicas y tienen fase y prompt asignados; los informes de las fases 8 a 13 reportan todos los pasos en exit 0 y declaran que esas fases no tenían requisitos. Nadie puede responder con los artefactos del repositorio cuáles de los 163 están construidos, y la planificación de noviembre (15 semanas, 18 pantallas) se dimensiona sobre esa ambigüedad.

### [MEDIA] La regla «una inscripción por gestión y persona» cita dos requisitos que no la dicen

`packages/application/src/create-registration.ts:105`

**Qué está mal.** El comentario reza `// 5. Una persona, una inscripción por gestión (PAY-001, GOV-001).` PAY-001 es «El cargo congela paquete, versión de precio, moneda e importe» y GOV-001 es «Todo registro transaccional aplicable pertenece a una gestión»; ninguno enuncia la unicidad. El requisito que sí la enuncia está en el contrato: IAM-002, cuyo criterio es literalmente «Existe una inscripción por gestión y persona» (requirements.md L188), y no lo cita nadie en todo el repositorio. La cita venía de `REG-002` y la renumeración la trasladó mecánicamente a `PAY-001` (61a2551), preservando un error previo y volviéndolo más difícil de ver: PAY-001 sí es el requisito correcto tres líneas más abajo (L118, congelación del cargo), así que el mismo identificador aparece dos veces con dos propósitos, uno válido y otro no.

**Cómo falla.** El único punto de aplicación de la unicidad de inscripción queda sin trazabilidad real. Si mañana se relaja PAY-001 o se decide permitir varias inscripciones por persona, la búsqueda por IAM-002 no encuentra este `if` y la comprobación se conserva o se elimina por accidente. La regla `06-delivery-gates` («actualiza contratos y trazabilidad») no puede cumplirse porque el enlace apunta a otro sitio.

### [MEDIA] La pantalla atribuye a DEC-016 un bloqueo que no existe: la autenticación lleva resuelta desde P04

`apps/web/src/app/admin/e/[eventCode]/configuracion/page.tsx:90`

**Qué está mal.** El `ReadonlyState` dice: «Modificar la configuración y ejecutar transiciones requiere sesión autenticada, bloqueada por DEC-016». DEC-016 está `APPROVED` desde 2026-08-05 (decision-register.md:24) y Better Auth quedó cableado en P04, antes de `main` (commit 1545121): existen `apps/web/src/lib/auth.ts`, `session.ts`, `/ingresar`, MFA, y otras pantallas de esta misma rama ejecutan mutaciones autenticadas con `requirePermission`. Nada está bloqueado por DEC-016; lo que ocurre es que `transitionEvent` nunca se cableó. Es un comentario que explica una decisión que el código no toma. El mismo fichero (línea 14-18) cita «EVT-016 y EVT-016», el mismo identificador dos veces, resto de la sustitución de renumeración. Y `apps/web/src/app/admin/eventos/page.tsx:37` dice que la creación de gestiones «llega junto con la autenticación (P04)»: P04 llegó y la creación no. El commit 61a2551 tocó los dos ficheros para renumerar y no corrigió ninguna de las tres afirmaciones.

**Cómo falla.** Un desarrollador que retoma el proyecto lee que la edición está bloqueada por una decisión de autenticación, va a decision-register.md, la ve aprobada, y pierde tiempo buscando qué falta en la capa de auth. El trabajo real —escribir la acción de servidor que invoque `transitionEvent`, que ya existe y está probado— no aparece por ninguna parte.

### [MEDIA] La tabla del go/no-go se contradice con el §7 del mismo fichero, editado en el mismo commit

`docs/implementation/14-hardening-release.md:130`

**Qué está mal.** El §7 de este fichero tacha el pendiente 2 («Cerrado el 7-ago-2026» con `deploy/db-roles.sql`) y el pendiente 5 («Ejecutada el 7-ago-2026» con `scripts/load-test.mts`), ambos cerrados por el commit 711952c, que edita este mismo archivo. Pero la tabla del §8 —encabezada «Actualización del 7 de agosto de 2026»— sigue listando «Rol de aplicación no propietario de las tablas | Trabajo pendiente, ejecutable hoy» (130) y «Prueba de carga | Trabajo pendiente, ejecutable hoy» (131). handoff.md §6 remite a este documento como «Estado del go/no-go, actualizado». Encima, la «Actualización del 5-ago-2026» (línea 136) está colocada DESPUÉS de la del 7 de agosto y enlaza `../01-product/requirements-candidates-v26.md`, que el commit 61a2551 movió a `archive/requirements-candidates-v26-SUPERADO.md`: el enlace está roto, y `scripts/validate_canonical_docs.py:70` sigue eximiendo esa ruta muerta.

**Cómo falla.** Quien evalúe el go/no-go antes de fusionar lee la tabla del §8 y concluye que faltan cuatro pendientes, dos de ellos «ejecutables hoy». Reasigna trabajo para rehacer el rol de base de datos y la prueba de carga, que ya están hechos y verificados. En sentido contrario, quien lea solo el §7 creerá que el veredicto cambió, cuando el documento nunca lo recalcula.

### [BAJA] Cifras y comentarios que ya no describen el repositorio: commits, tablas y el propio comentario del validador

`handoff.md:3`

**Qué está mal.** handoff.md línea 3 dice «trece commits por delante de `main`» y la línea 183 «Doce commits sin revisar»; `git rev-list --count main..HEAD` da 15, y el propio fichero se editó en el último commit. §2 (línea 37) dice «40 modelos» y §4 (línea 135) «41 tablas» del mismo esquema (`grep -c '^model ' prisma/schema.prisma` = 40). En `scripts/validate_canonical_docs.py:55` el comentario afirma «Ahora la expresion acepta cualquier prefijo de tres o cuatro mayusculas», pero el regex de la línea siguiente es `[A-Z]{2,4}` — dos a cuatro, que es lo que dicen handoff §7.3 y el informe 17 §9: el comentario subestima la cobertura y hace dudar de si `QR-###` está comprobado. Y en `apps/web/src/lib/container.ts:96-103` hay dos bloques JSDoc apilados: el primero, «Repositorio de revisión de evidencias … el secreto de verificación no se persiste», queda pegado a `objectStorage()`, que no tiene nada que ver; la función que describe, `paymentProofRepository`, está veinte líneas más abajo y sin documentar.

**Cómo falla.** El revisor de la fusión usa «trece commits» para dimensionar la pasada y deja dos commits sin mirar. Quien audita si el validador cubre la familia `QR` lee el comentario, concluye que los prefijos de dos letras quedan fuera, y añade una comprobación redundante o —peor— da por no verificadas citas que sí lo están.


## F. Contabilidad

### [MEDIA] Nada valida contracts/accounting-rules.json, y el catálogo de roles vive duplicado a mano en SQL

`scripts/validate_canonical_docs.py:6`

**Qué está mal.** DEC-018 §11 cierra con «El validador rechaza reglas sin cuenta, sin reversión o con decisiones bloqueantes pendientes». Ese validador no existe. `accounting-rules.json` no está en la lista `required` del validador documental ni se abre en ninguna parte del script, y `contracts/accounting-rules.schema.json` —prometido en docs/_incoming/correccion-documental-contable/00_LEEME_PRIMERO.md:29 y listado como entregable en docs/04-delivery/READINESS_REPORT-correccion-contable.md:184— nunca se creó: solo existe la copia dentro de `docs/_incoming/`. El propio READINESS_REPORT (línea 201) deja la validación como pendiente y aun así el gate se declara verde. Agravante: los 21 roles están escritos dos veces, en el JSON (líneas 9-25) y en el CHECK `accounts_chart_role_canonical` de la migración P17, sin ninguna comprobación que los mantenga sincronizados.

**Cómo falla.** Alguien añade una regla que cita `PETTY_CASH` o que declara un débito sin crédito, o corrige el CHECK de la migración sin tocar el JSON. Prettier, ESLint, tsc, las 418 unitarias, las 162 de integración, `pnpm build` y `validate_canonical_docs.py` pasan todos: ningún gate abre el archivo. El fallo aparece cuando se implemente el motor y un `INSERT` en `accounts_chart` reviente contra el CHECK, o cuando un asiento se genere con una sola pata.

### [MEDIA] FINANCIAL_TRANSFER resuelve origen y destino con el mismo resolvedor: el asiento se anula a sí mismo

`contracts/accounting-rules.json:221`

**Qué está mal.** La regla 19 de DEC-018 (docs/04-delivery/decisions/DEC-018.md:95) dice literalmente débito «Cuenta de destino», crédito «Cuenta de origen»: son dos cuentas distintas. El contrato traduce ambas patas al mismo `FINANCIAL_ACCOUNT_BY_CHANNEL`, cuyo `resolvesBy` es `paymentChannel` (línea 30), un único campo de entrada. Una transferencia entre cuentas propias no tiene «un» canal: tiene uno de salida y otro de entrada, y el contrato no ofrece forma de distinguirlos. Con la información declarada, cualquier implementación fiel resuelve las dos líneas a la misma cuenta.

**Cómo falla.** Se transfieren 5.000 de caja a banco. El motor resuelve `FINANCIAL_ACCOUNT_BY_CHANNEL` una vez para el débito y otra para el crédito con el mismo `paymentChannel` y obtiene `CASH_ON_HAND` en ambas: genera un asiento que debita y acredita 5.000 a caja. Cuadra, pasa el trigger `journal_lines_balance`, se guarda con `entryKind: TRANSFER`, y por el índice de idempotencia queda como el asiento definitivo de esa transferencia. Caja sigue mostrando 5.000 que ya no están y banco no registra la entrada; la conciliación del mes descubre el descuadre en las dos cuentas a la vez.

### [MEDIA] El signo de la diferencia de conciliación quedó en una nota en prosa, no en la regla

`contracts/accounting-rules.json:246`

**Qué está mal.** DEC-018 §10 corrección 8 retira `RECONCILIATION_DIFFERENCES_OR_DEFINED_COUNTERPART` con el argumento de que «un identificador con un "o" dentro no es resoluble por máquina». La ambigüedad no se resolvió: se movió. `RECONCILIATION_DIFFERENCE` fija `debits: RECONCILIATION_DIFFERENCES` y `credits: FINANCIAL_ACCOUNT_BY_CHANNEL`, y añade `"notes": "Si la diferencia es a favor, débito y crédito se invierten"` — castellano que ningún motor lee. La propia matriz de DEC-018 (línea 97) conserva el «o» en la fila 21. `reconciliationDifference()` en packages/domain/src/accounting.ts:119 devuelve `counted - booked`, con signo, así que el dominio sí conoce la dirección; el contrato la descarta. Como la regla lleva `appliesInV1: true` y PAY-012 ya exige el cierre de caja con diferencia motivada, es una de las pocas reglas que se ejecutará de verdad en v1.

**Cómo falla.** Un cierre de caja cuenta 1.020 contra 1.000 registrados: sobran 20. Un motor que aplique la regla tal como está declarada debita `RECONCILIATION_DIFFERENCES` 20 y acredita la cuenta de caja 20, es decir, contabiliza un faltante de 20 sobre una caja que ya estaba corta 20 respecto de lo contado. El efectivo real queda subvaluado en 40 y el ajuste apunta en el sentido contrario al hecho que documenta.


## G. Infraestructura y despliegue

### [ALTA] Tras restaurar de verdad, la separación de roles de P03 desaparece y no se vuelve a aplicar

`docs/04-delivery/runbooks.md:103`

**Qué está mal.** deploy/backup.sh:120 vuelca con `pg_dump --no-owner --no-acl` y el runbook restaura con `pg_restore -d encuentro --no-owner --no-acl` desde `exec postgres` (superusuario). El resultado es una base `encuentro` recién creada por `createdb -U $POSTGRES_USER`, con las ~41 tablas propiedad de `postgres` y sin ningún GRANT para `encuentro_app`: el volcado no lleva ni propietarios ni ACLs, por construcción. La sección 1 del runbook sí recuerda «tras una migración que cree tablas conviene volver a pasar deploy/db-roles.sql», pero la sección 3 no lo menciona en ningún punto, y el paso 4 se limita a `up -d web worker` y a un curl al health check. La mitigación completa de 711952c —que encuentro_app no sea propietario y no pueda truncar audit_logs— se pierde exactamente el día en que el sistema ya ha sufrido un incidente.

**Cómo falla.** Restauración terminada, se levantan web y worker. `encuentro_app` conserva CONNECT (PUBLIC lo tiene por defecto en una base nueva) pero no tiene SELECT/INSERT sobre ninguna tabla, así que cada consulta devuelve «permission denied for table ...» y /api/health da degraded. Con el evento en marcha y el reloj corriendo, el arreglo evidente y rápido es apuntar DATABASE_URL al superusuario `postgres` para volver a estar en pie; a partir de ahí la aplicación es propietaria de todo y `TRUNCATE audit_logs` vuelve a funcionar, que es el escenario concreto que db-roles.sql:10-13 documenta como el problema a eliminar. Nadie lo notará porque el health check pasa.

### [ALTA] La restauración real del runbook no puede ejecutarse: el contenedor postgres no tiene ni el volumen de respaldos ni la clave

`docs/04-delivery/runbooks.md:95`

**Qué está mal.** El paso 3 de «Restauración desde respaldo» ejecuta `docker compose ... exec postgres bash -c 'gpg --batch --decrypt --passphrase "$BACKUP_PASSPHRASE" /backups/encuentro-<marca>.dump.gpg | pg_restore -d encuentro ...'`. En deploy/docker-compose.prod.yml el servicio `postgres` (líneas 76-91) monta únicamente `pgdata`, no el volumen `backups`, y su bloque `environment` solo define POSTGRES_DB/USER/PASSWORD: no existe `BACKUP_PASSPHRASE`. El volumen `backups` y la clave están solo en el servicio `backup` (líneas 125 y 141), que además es el único con awscli para bajar la copia remota. Nada de esto se descubre en el ensayo, porque restore-drill.sh corre dentro del contenedor `backup`, que sí tiene ambas cosas: el ensayo y la restauración real recorren rutas distintas y solo se ha probado la que no se usa el día del desastre. Además el comando pasa la contraseña como argumento de línea de órdenes —visible en `ps` de cualquier proceso del host y en el histórico del intérprete—, justo la práctica que backup.sh y restore-drill.sh evitan deliberadamente con `--passphrase-fd 3`.

**Cómo falla.** El VPS pierde la base. El operador sigue el runbook al pie de la letra: renombra `encuentro`, crea la base vacía y lanza el paso 3. `bash` expande `$BACKUP_PASSPHRASE` a cadena vacía (o falla por `set -u` según el intérprete) y `gpg` no encuentra `/backups/encuentro-<marca>.dump.gpg` porque ese directorio no existe en el contenedor postgres. Resultado: la base productiva ya está renombrada y vacía, y el procedimiento documentado para recuperarla acaba de fallar. El RTO de 4 horas de DEC-012 se consume improvisando bajo presión.

### [MEDIA] El bloque que dice limitar el ritmo de la verificación pública no contiene ninguna directiva de rate limit

`deploy/Caddyfile:31`

**Qué está mal.** El comentario afirma que se protege la única superficie sin sesión («Sin límite, alguien podría probar tokens a gran velocidad»), pero el bloque `@verificacion path /verificar/comprobante/*` / `handle @verificacion { reverse_proxy web:3000 }` solo repite el proxy por defecto: no hay `rate_limit` ni ningún equivalente. Caddy no trae `rate_limit` en el binario estándar —es un plugin— así que ni siquiera es un fallo de sintaxis que fallara al arrancar: el bloque es un no-op silencioso. Un `grep -rn 'rate_limit\|rateLimit'` sobre `deploy/`, `apps/`, `packages/` y `contracts/` no devuelve ninguna configuración propia; lo único que existe es `accountLockout` del plugin `twoFactor` en `packages/infrastructure/src/auth.ts:93`, que cubre los intentos de segundo factor y nada más. `apps/web/src/lib/receipt-verification.ts` documenta la misma expectativa incumplida («el endpoint deberá ir tras rate limit»). IAM-004 (`docs/01-product/requirements.md:190`) exige límite de intentos en acceso, recuperación y cambios sensibles, y NFR-007 fija ASVS L2. El control descrito no existe, y el comentario hace que parezca que sí, que es lo que impide que alguien lo eche en falta en una revisión posterior. Tampoco se emite `Content-Security-Policy` en ninguna parte, pese a que sí están HSTS, `nosniff`, `X-Frame-Options` y `Referrer-Policy`.

**Cómo falla.** Con el token de 32 bytes la fuerza bruta no es el riesgo real; el que queda abierto sí lo es: `/verificar/comprobante/<token>` es anónimo y sin cuota, y cada petición fuerza render dinámico en el proceso web. Un solo cliente satura la aplicación durante la ventana operativa del evento (NFR-001). Lo mismo vale para el resto del origen: `/ingresar` y la recuperación de contraseña quedan sin límite propio en el proxy, contra lo que pide IAM-004.


## H. Conocidos y ya anotados

### [MEDIA] PAY-027: la comprobación de referencia duplicada en la aprobación no puede disparar nunca, y el índice que la sustituye distingue mayúsculas

`packages/infrastructure/src/payment-proof-repository.ts:244`

**Qué está mal.** El `count` de las líneas 244-251 busca otra evidencia de la misma gestión con la misma `reference` en estado APPROVED. Pero `@@unique([eventId, reference])` (prisma/schema.prisma:663) es incondicional: no puede existir una segunda fila con ese par, así que `duplicate` es estructuralmente siempre 0 y `duplicateReference` siempre `false`. El comentario que justifica el chequeo («el índice lo permite si la primera se creó antes») describe un comportamiento que un índice único no tiene. La consecuencia es que la única defensa real de PAY-027 es la igualdad exacta de cadena, y la referencia solo se normaliza con `.trim()` (packages/application/src/submit-payment-proof.ts:232): no se pasa a mayúsculas ni se eliminan separadores internos.

**Cómo falla.** El peregrino carga una evidencia con referencia `TRX-9981` y la aprueban. Luego carga una segunda con la misma foto y referencia `trx-9981` (o `TRX 9981`): el índice único no colisiona, la evidencia se crea, `duplicateReference` sale `false` como siempre, y un revisor distinto la aprueba. Se generan dos `payments` SUCCEEDED, dos asignaciones y dos comprobantes numerados por una única transferencia bancaria. El descuadre solo se ve en la conciliación contra el extracto del banco, y los triggers de inmutabilidad impiden revertirlo sin anular comprobantes.

### [MEDIA] El archivo se escribe en el almacén privado antes de que la inserción pueda fallar, y nada lo recoge después

`packages/application/src/submit-payment-proof.ts:220`

**Qué está mal.** El comentario de cabecera del módulo promete que «el archivo se guarda al final y solo si todo lo demás vale… guardarlo antes dejaría un objeto huérfano en el almacén por cada intento rechazado, y nadie los recogería». La promesa no se cumple para los dos fallos que ocurren *después* del guardado: `deps.evidence.store(...)` se ejecuta en la línea 220 y solo entonces `deps.proofs.submit(...)` (línea 226) puede devolver `DUPLICATE_REFERENCE` —lo detecta el índice `@@unique([eventId, reference])` vía `esReferenciaDuplicada`, a propósito, para cerrar la carrera de PAY-027— o `CONFLICT`. `assertWritten` convierte ambos en `DomainError` y la acción devuelve el mensaje al peregrino, pero el objeto ya está en el bucket con su `fileId` aleatorio y ninguna fila que lo referencie. Lo mismo en `resubmitPaymentProof` (línea 288), donde el CAS puede fallar tras el guardado. No hay política de ciclo de vida en `createObjectStorage` (`ensureBucket` solo crea el bucket), ni trabajo de limpieza en `apps/worker/src/main.ts`, ni ninguna cuota por usuario o por inscripción sobre `submitProofAction`. El límite de cuerpo se subió además a 12 MB en `apps/web/next.config.ts` y `EVIDENCE_MAX_BYTES` son 10 MB, así que cada intento fallido cuesta hasta 10 MB permanentes de almacenamiento que además entran en los respaldos cifrados de DEC-012.

**Cómo falla.** Un peregrino inscrito y con sesión envía repetidamente el formulario de `/e/ENC2026/mi-cuenta/pagos` con un adjunto de 10 MB y la misma referencia bancaria ya usada. Cada envío supera la validación del dominio, escribe el objeto en `evidencias/<eventId>/<uuid>`, choca contra el índice único y devuelve «Ya existe una evidencia con esa referencia». La fila nunca se crea, el objeto nunca se borra y nadie lo enumera: cien envíos dejan un gigabyte inalcanzable en el almacén privado.

### [MEDIA] PAY-006: ningún comando de cobro acepta clave de idempotencia, y un reintento no devuelve el mismo resultado

`packages/application/src/review-payment-proof.ts:72`

**Qué está mal.** docs/01-product/requirements.md:148 pide que «todo comando de cobro acepta clave de idempotencia» con el criterio «un reintento devuelve el mismo resultado», y docs/04-delivery/requirement-migration-v2.6-to-current.md:191 lo marca explícitamente «Entra en v1». Ninguno de los comandos del circuito lo declara: `ReviewPaymentProofCommand` y `TakeForReviewCommand` (líneas 66-81), `SubmitPaymentProofCommand` y `ResubmitPaymentProofCommand` (submit-payment-proof.ts:161-181), ni el puerto `PaymentProofRepository.approve`. El único mecanismo presente es el compare-and-swap sobre `version`, que es lo contrario de idempotencia: el reintento no repite el resultado, falla. El grep de «idempot» en todo el repositorio solo devuelve ADR-008 (entregas de beneficios) y contracts/accounting-rules.json; nada en el circuito de pagos.

**Cómo falla.** El revisor pulsa «Aprobar y emitir comprobante»; la respuesta se pierde por un corte de red aunque la transacción sí se aplicó. Reintenta con los mismos datos: `approve` no encuentra la fila en UNDER_REVIEW con la versión esperada y devuelve `false`, que se traduce a `EVENT_VERSION_CONFLICT` («la evidencia cambió, vuelva a cargarla»). El revisor no puede distinguir «ya se cobró» de «alguien se adelantó y hay que rehacerlo», que es exactamente la ambigüedad que PAY-006 existe para eliminar en la operación que mueve dinero.
