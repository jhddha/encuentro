# Handoff — sesiones del 7 y del 8 de agosto de 2026

**Rama:** `migracion-linea-base-v2.6`, **veintiocho commits** por delante de `main` (`626ad05`). Los trece últimos **sin subir a GitHub**.
**Gate al cerrar la sesión del 7:** validador, prettier, ESLint, `tsc --build`, **345 unitarias**, **129 de integración**, `pnpm build`. Todo en verde.
**Gate al cerrar la sesión del 8:** validador, prettier, ESLint, `tsc --build`, **424 unitarias**, `prisma validate`, `pnpm build`. En verde. **Las de integración no se pudieron ejecutar en la segunda mitad de la sesión**: ver §9.4.

> Las secciones 1 a 6 son la sesión del 7 de agosto y se conservan como se escribieron. Las §7 a §9 son la del 8.

---

## 1. Objetivo

La sesión empezó con un veredicto **no-go** heredado y siete pendientes que lo justificaban. El objetivo fue cerrarlos, y en el camino apareció uno mayor que los englobaba: **la documentación mentía sobre lo que el sistema debía hacer**, y por tanto ningún gate podía decir si estaba listo.

El objetivo real acabó siendo doble:

1. Recuperar la línea base de requisitos v2.6 y hacer que el contrato declare la verdad.
2. Empezar a construir la superficie operable, que no existía.

---

## 2. Estado actual

### Contrato

**163 requisitos** sobre una línea base de **198** (185 de v2.6 más 13 del parche canónico DEC-004).

| ACC 16 · PAY 22 · EVT 15 · QR 13 · HOS 12 · NFR 12 · IAM 11 | GOV 10 · REG 10 · PKG 8 · TRN 8 · NTF 7 · FOD 5 · AUD 4 · MAT 4 · SRV 4 · OBS 2 |
|---|---|

Los 35 que faltan son reemplazados, eliminados con DEC que lo justifica, conservados bajo otro identificador, o de alcance aplazado por decisión suya.

### Código

| Capa | Estado |
|---|---|
| Esquema | Completo — 40 modelos, constraints, triggers, índices de concurrencia |
| Dominio | 13 módulos de reglas puras |
| Aplicación | **6 casos de uso** (eran 4 al empezar) |
| Pantallas | **18 de 31 siguen siendo marcadores** (eran 19) |

### Decisiones

Dieciocho, todas `APPROVED`. Ninguna `BLOCKING`. DEC-018 se aprobó en esta sesión.

---

## 3. Qué ha cambiado

### El hallazgo que reordenó todo

Apareció el documento de requisitos v2.6 y contenía **185 exactos**. Al cruzarlo con los 65 del contrato, el problema no era el que creíamos:

**La v2.7 reutilizó identificadores de v2.6 para requisitos distintos.** `PAY-004` designaba el webhook de confirmación online y pasó a designar el registro de evidencias. `HOS-001` designaba hoteles y habitaciones y pasó a designar el número de noches. Ocurría de forma masiva en PAY, HOS, REG y PKG **sin que nada fallara**: la trazabilidad simplemente mentía.

Los 198 quedaron clasificados uno a uno. Solo **cuatro** se dan por eliminados, y los cuatro citan una decisión aprobada.

### Renumeración

573 sustituciones en 96 archivos, restituyendo la numeración de v2.6. La familia `CASH` desapareció —v2.6 no la tiene, la caja vive en `PAY`— y `FOOD` volvió a `FOD`.

### El validador ahora comprueba cuatro cosas que nadie comprobaba

Que `requirements.md` y `requirements.json` declaren el mismo conjunto; que los mapas de fase y prompt no tengan huérfanos; que **todo requisito tenga fase y prompt**; y que **ninguna cita del repositorio apunte a un requisito inexistente**.

Al activar la tercera aparecieron nueve requisitos sin fase: `GOV-001` a `GOV-009`, las invariantes que gobiernan todo el sistema.

### Pendientes de P14 cerrados

**Cinco de siete.**

- **Workers** de expiración de `HELD` y envío de correo — `apps/worker` no tenía ninguna cola.
- **DEC-018**, reconocimiento contable: 21 roles, 3 resolvedores, matriz de 22 reglas.
- **Respaldo externo** a Backblaze B2, con ensayo de restauración remoto.
- **Rol de aplicación no propietario** de las tablas.
- **Prueba de carga**, ahora `pnpm test:load`.

### Bloque 1 — circuito de pagos

`REG-017`, la regla que decide si alguien está inscrito, y el circuito completo del revisor: bandeja, tomar para revisión, panel con el comprobante visible, aprobar con reparto, rechazar y pedir corrección. Más el almacenamiento privado de evidencias.

Y las **primeras mutaciones del proyecto**: hasta ahora las doce pantallas existentes eran todas de lectura.

---

## 4. Qué he intentado y qué ha fallado

Esta sección importa más que las anteriores. Lo que sigue son errores reales, no contratiempos menores.

### El incidente serio: doble renumeración

La primera pasada usó `git ls-files`, que **solo lista archivos versionados**. Los diez ficheros de P16 estaban sin versionar y se quedaron con la numeración vieja. Al reejecutar incluyéndolos, el script **volvió a renombrar los versionados que ya estaban correctos**: los ocho identificadores que son a la vez origen y destino se movieron dos veces. `lodging.ts` perdió su referencia a `HOS-002`.

**No era recuperable por texto** —`HOS-013` puede venir de `HOS-002` (correcto) o de `HOS-008 → HOS-002 → HOS-013` (doble)—. Se regeneraron 33 archivos desde `HEAD` aplicando el mapa una sola vez, tras verificar que los cinco archivos con trabajo nuevo no contenían ninguno de los ocho ambiguos.

**Lección:** el mapa de renumeración tenía ocho colisiones origen-destino y yo lo sabía —lo documenté antes de ejecutar—. El fallo no fue no verlo, fue no hacer el script idempotente.

### Correcciones a cosas que yo mismo había afirmado

- Dije que la brecha era **renumeración** y que era menos grave. Con la fuente delante resultó ser **colisión de identificadores**, que es peor. Corregido.
- Dije que la línea base eran **195** requisitos. Son **198**: se me escaparon `FOD-006`, `FOD-007` y `FOD-008` porque mi filtro no incluía el prefijo `FOD`.
- Dije que entraban **82** requisitos en v1. Fueron **87**.
- Dije que el «siete documentos v2.6» estaba verificado. **No lo estaba**: es una afirmación suelta en `source-migration-matrix.md` que nadie enumera.

### El validador me atrapó cuatro veces

Y esas cuatro son la mejor prueba de que valía la pena escribirlo:

1. Los diez archivos de P16 que la primera pasada no tocó.
2. Cité `OPS-007` y `NOT-010` en el código de P16 — identificadores de la familia que **yo mismo inventé** en el archivo de candidatos.
3. Cité `NTF-009`, canónico pero **todavía no en el contrato**.
4. Cité **dos veces en el mismo commit** el número que la secuencia de comprobantes tenía *antes* de la renumeración, en vez del canónico.

Y una quinta, al escribir este mismo documento, que además obligó a corregir una decisión tomada un minuto antes.

El validador rechazó este archivo por citar identificadores retirados. La primera reacción fue reescribir las frases para esquivarlo. Pero al mirar cuáles eran —el que designaba el webhook, el de la cadena de la doble renumeración, el tercero de la familia `FOD`— quedó claro que **un documento que explica una colisión de identificadores necesita nombrarlos**, igual que la matriz de migración. Contorsionar la prosa habría sido peor que eximir el archivo.

Así que `handoff.md` está en la lista de exentos de `scripts/validate_canonical_docs.py`, junto a los otros documentos que hablan de las dos numeraciones a la vez. La exención es por naturaleza del documento, no por conveniencia.

### Errores de programación corrientes

- Un `export` que **no se aplicó y no me enteré**: prettier había colapsado la línea y mi reemplazo por texto no encontró el patrón, sin protestar. Lo detectó el typecheck. En los demás reemplazos usé `assert`; en ese se me pasó.
- `money()` recibe texto decimal, no números. Diez pruebas rojas.
- `bedIndex` es 1-based, no 0-based.
- Un `upsert` pasando cadena vacía como UUID.
- Las variables de `psql` no se sustituyen dentro de un bloque `DO $$`.
- `scripts/` no resuelve los paquetes del workspace con `tsx`; `prisma/` sí.
- El fixture dejaba la gestión en `DRAFT`, y `GOV-003` solo admite operaciones en `ACTIVE`: el revisor habría recibido `EVENT_OPERATIONS_BLOCKED` y habría parecido un fallo del código.

### Lo que descubrí al mirar, no al razonar

- **El contenedor de respaldo no tenía salida a Internet.** Estaba solo en la red `internal`, marcada `internal: true`. Físicamente no podía subir nada a ninguna parte.
- **El runbook documentaba `backup.sh --once`, que no existía.**
- **`RECEIPT_VERIFICATION_SECRET` estaba declarado desde P01 y no lo usaba nadie.** Los cuatro `OBJECT_STORAGE_*`, igual.
- **La aplicación se conectaba a Postgres como superusuario** y propietaria de las 41 tablas. `DELETE FROM audit_logs` se rechazaba con GOV-009 y `TRUNCATE audit_logs` la vaciaba sin oposición.
- **Ningún rol tenía `payment.proof.review`**, así que nadie podía entrar a la bandeja que acababa de construir.

### El hallazgo más incómodo

Al preparar el triage descubrí que **el hueco no eran cincuenta requisitos sino la superficie operable entera**: 19 de 31 rutas eran marcadores y la capa de aplicación tenía cuatro casos de uso.

Los informes de implementación **nunca afirmaron lo contrario** — el de P07 lo dice en su apartado «Qué NO se implementó». La expectativa era mía y debí verificarla antes de repetirla.

---

## 5. Qué planeo hacer después

### Inmediato — cerrar el bloque 1

| | |
|---|---|
| Caso de uso de subida de evidencia | Une el archivo con la evidencia: importe, moneda, fecha, banco, referencia, pagador y checksum (`PAY-018`) |
| `/e/…/mi-cuenta/pagos` | Donde el peregrino sube el comprobante. **Sin esto nadie paga por anticipado**, y son la mitad de los 600 |
| `/e/…/mi-cuenta` | Estado de cuenta: qué debe, qué pagó, qué saldo tiene |

### Plan acordado para noviembre

Alcance completo por decisión del responsable. El riesgo se gestiona **con el orden, no recortando**: si en noviembre falta algo, que sea lo último de la fila.

| Bloque | Contenido |
|---|---|
| 1. Dinero anticipado | revisor **hecho** · peregrino pendiente |
| 2. Hospedaje | elegir hotel tras el 50 %, asignar habitación |
| 3. Llegada | caja con arqueo, credencial, check-in |
| 4. Operación | escáner **con modo offline**, alimentos, materiales, comisiones |
| 5. Cierre | transporte, motor contable, reportes, correo |

El orden no es arbitrario: el 2 depende del 1, el 4 del 3, y el 5 va al final porque el cierre financiero ocurre *después* del evento.

### Riesgos abiertos

**El calendario.** Última semana de noviembre de 2026, ~15 semanas, 18 pantallas y del orden de 30 casos de uso partiendo de 6. Advertí que no creo que quepa; el responsable decidió mantener el alcance completo y lo respeto. Queda escrito porque en octubre conviene poder mirar atrás y ver cuándo se supo.

**Verificación con sesión real.** `pnpm db:fixture <correo>` ya monta el escenario, pero **nadie ha recorrido las pantallas a mano todavía**. Hasta que ocurra, «funciona» significa «pasa las pruebas».

**Riesgo aceptado sobre el modo offline.** Se aplazó cuando la conectividad se dio por estable, y luego el alcance completo lo volvió a incluir. Si vuelve a salirse, con 600 personas y miles de entregas **no hay plan B**: si la señal cae en el punto de comidas, la entrega se detiene.

### Bloqueado por terceros

- **Backblaze B2** — crear el bucket, una Application Key limitada a él (no la maestra) y ejecutar el primer `restore-drill.sh --remote`. Eso cierra DEC-012.
- **El VPS no existe.** Firewall y despliegue esperan a que se aprovisione. No son trabajo pendiente sino infraestructura pendiente.
- **Las 21 cuentas contables** — DEC-018 fija roles, no números. Sin la asignación, el motor no resuelve ningún asiento.
- **Revisar y fusionar la rama.** Doce commits sin revisar es mucho para una sola pasada.

---

## 6. Cómo retomar

```bash
pnpm db:up                              # Postgres, Redis y MinIO
pnpm exec prisma migrate deploy
pnpm exec prisma db seed                # gestión ENC2026 y tres roles
pnpm db:fixture tu-correo@ejemplo.org   # escenario revisable a mano
pnpm --filter @encuentro/web dev
```

El fixture imprime los pasos exactos. El correo debe estar **ya registrado**: ni el seed ni el fixture crean credenciales, porque una contraseña por defecto es una cuenta con acceso conocido en cualquier entorno donde el script corra.

### Documentos que conviene leer antes de tocar nada

| | |
|---|---|
| `docs/04-delivery/requirement-migration-v2.6-to-current.md` | Los 198 clasificados, con el porqué de cada decisión |
| `docs/04-delivery/triage-alcance-evento.md` | Qué está construido de verdad y qué no |
| `docs/04-delivery/decisions/DEC-018.md` | Roles contables y matriz operación→asiento |
| `docs/implementation/14-hardening-release.md` | Estado del go/no-go, actualizado |

---

# 7. Sesión del 8 de agosto de 2026

## 7.1 Qué se cerró

El «Inmediato» de §5, entero.

| | |
|---|---|
| **Caso de uso de carga de evidencia** | `packages/application/src/submit-payment-proof.ts` — PAY-018 con sus siete datos, PAY-025, PAY-027, PAY-021 |
| **Reenvío tras corrección** | El circuito estaba **cortado**: el revisor podía pedir una corrección que nadie podía hacer |
| **`/e/…/mi-cuenta/pagos`** | El peregrino declara su pago. Sin esto no podía pagar la mitad de los 600 |
| **`/e/…/mi-cuenta`** | Estado de cuenta: cargos, pagos, saldo, saldo a favor y por qué no está confirmado |

Con eso la capa de aplicación pasa de 6 a **7 casos de uso** y los marcadores de pantalla de 18 a **16 de 31**.

## 7.2 Las tres decisiones de diseño que importan

**La autorización del peregrino no es un permiso, es la titularidad.** El peregrino no tiene ninguna asignación de rol —DEC-014 se apoya en eso para eximirlo del segundo factor—, así que `can()` le devuelve `false` para todo. Darle un rol para que pague lo suyo le daría alcance sobre lo ajeno. El dominio gana `owns` y `authorizeOwnership` junto a `authorize`. Un `ownerUserId` nulo nunca autoriza: IAM-012 admite inscripciones presenciales sin cuenta, y tratar el nulo como coincidencia las dejaría abiertas a cualquiera.

**El archivo se guarda al final.** Subirlo antes de validar deja un objeto huérfano en el bucket por cada intento rechazado. El caso de uso valida todo y después invoca el puerto `EvidenceStore`; tres pruebas lo fijan. El efecto secundario es que la lista blanca de tipos y el límite de 10 MB bajaron al dominio: el almacén los sigue comprobando como última barrera, pero ya no es quien produce el mensaje, porque `ObjectStorageError` no es un `DomainError` y llegaría al peregrino como pantalla de error.

**La corrección es la misma fila, no una evidencia nueva.** La referencia bancaria es única por gestión, así que duplicarla chocaría contra el índice; y una evidencia es una transferencia, no un intento. El motivo del rechazo se limpia de la fila —dejarlo haría que el revisor leyera como pendiente algo ya atendido— pero sobrevive en `audit_logs`, con una prueba que lo comprueba.

## 7.3 Lo que apareció al mirar

**Tres citas a requisitos que no existen.** `PRV-003` y `PRV-004` en tres archivos, `RBAC-001` en un cuarto. Ninguna de las dos familias está en el contrato.

Lo incómodo no es la cita: es que la comprobación 3 del validador —la que §3 de este documento presenta como «ninguna cita del repositorio apunta a un requisito inexistente»— **no podía detectarlas**. Su expresión regular enumeraba las familias una a una, y `PRV` y `RBAC` no estaban en la lista. Buscaba citas inventadas y solo encontraba las de las familias que ya conocía. Justo el fallo que el validador se escribió para impedir, en el propio validador.

Ahora acepta cualquier prefijo de dos a cuatro mayúsculas y excluye por lista lo que no es un requisito. Al activarla salieron exactamente esas cuatro citas y ninguna más.

**El saldo a favor no estaba donde parecía.** `computeBalance` compara cargos contra asignaciones, y PAY-020 impide asignar a un cargo más de lo que debe: ese saldo no puede salir negativo, así que el sobrepago no aparecía. Vive en la parte del pago que no se repartió, que hasta ahora solo constaba en el snapshot del comprobante. De ahí `creditBalance`.

**Nadie confirma inscripciones.** `confirmRegistration` se escribió el 7 de agosto y **no tiene ningún llamador**. El sistema sabe decidir si alguien está inscrito y no lo registra en ninguna parte. El estado de cuenta lo dice en voz alta en vez de mostrar «Confirmada»: afirmarlo sería decir algo que la base no dice.

**DEC-009 no tiene de dónde congelar la tasa.** No hay tasa de cambio configurada en el esquema ni en la interfaz; solo la columna donde guardarla. Congelar significaría inventar un número que acabaría impreso en un comprobante. Registrado como **TBD-001** en el registro de decisiones: la rama multimoneda se detiene en `assertDeclarableEvidence` con un mensaje que lo explica, en vez de atravesar el sistema y morir al repartir contra los cargos.

## 7.4 Errores propios de esta sesión

Los dos primeros los encontraron las pruebas de integración **la primera vez que se ejecutaron**, y ninguno de los dos lo habría detectado ningún otro gate.

- **La detección del duplicado no funcionaba.** Escribí que Prisma reporta las columnas en conflicto en `meta.target`. **No es cierto con Prisma 7 y el driver adapter de Postgres**: ahí `meta.target` viene sin definir y las columnas están en `meta.driverAdapterError.cause.constraint.fields`. El resultado era que PAY-027 nunca se traducía: el `P2002` escapaba tal cual y el peregrino habría visto una pantalla de error genérica en lugar de «esa referencia ya existe». Compilaba, pasaba ESLint y pasaba las unitarias, porque el doble de prueba devolvía el resultado que yo esperaba. Lo verifiqué contra el error real con una sonda antes de arreglarlo, y ahora se leen las dos formas.
- **`Decimal.toString()` quita los ceros finales.** Una columna `Decimal(12,2)` que guarda `420.00` devuelve `"420"`. Da igual para operar, no para mostrar. Y **es un fallo que ya existía**: la bandeja del revisor viene enseñando «420 USD» desde que se escribió. Ahora todo importe que sale a pantalla pasa por `decimalText`, que convierte a través del dominio y no con `toFixed`, porque `toFixed` trabaja en coma flotante y eso es justo lo que NFR-014 prohíbe.
- Mi propia prueba de integración creaba una versión de precio `ADVANCE` sin vigencia ni mínimo de pago, contra el constraint `price_versions_advance_is_complete`. Diecisiete pruebas rojas por no haber leído la migración de P05.
- Dejé `eventId: input.proofId === '' ? undefined : undefined` en el repositorio de reenvío —un marcador de posición que escribí y no volví a mirar—. Habría escrito el `audit_log` sin gestión, y `tsc` no protesta porque el tipo admite `undefined`. Lo encontré releyendo, no compilando.
- Un comentario JSX dentro de `{done && ( … )}` sin fragmento que lo envolviera: siete errores de sintaxis de un solo comentario mal colocado.
- Convertí campos de `FormData` con `String()`. Un `FormData` puede traer un `File` en cualquier campo, y eso da «[object File]» como importe. Lo atrapó ESLint, no yo.

También corregí una afirmación mía en voz alta durante la sesión: dije que el motor Linux de Docker no arrancaba. Arrancaba, solo tardó unos treinta minutos. Con eso pudieron correr las de integración, que es lo que encontró los dos primeros fallos de esta lista.

### Y tres más, que encontró una revisión adversarial con el gate ya en verde

Cinco revisores independientes sobre el cambio —seguridad, dinero, concurrencia, viabilidad de las pruebas, fidelidad a los requisitos— y un verificador por hallazgo encargado de refutarlo. Veintiséis hallazgos, tres supervivientes, los tres reales.

- **El límite de cuerpo de una acción de servidor son 1 MB por defecto en Next.** Toda la evidencia viaja como `FormData`, así que el máximo de 10 MB que la pantalla promete y el dominio impone era **inalcanzable**: una foto de móvil normal (2–5 MB) recibía un 413 antes de que se ejecutara nada, y sin `try/catch` la promesa rechazada subía al *error boundary* en vez de a un mensaje. La carga habría fallado para la mayoría de los peregrinos, en silencio y con la pantalla diciendo «hasta 10 MB» al lado.
- **El autoservicio aceptaba canales de caja.** PAY-024 los reserva para caja y PAY-011 exige sesión de caja abierta; el código lo decía en tres comentarios y lo aplicaba **solo en la consulta que llena el desplegable**. El identificador del canal viaja en el formulario y la acción de servidor es invocable directamente: presentar el de un canal `CASH` producía una evidencia aprobable cuyo pago nunca aparecería en ningún arqueo y aun así bajaría el saldo. Es exactamente el error que mis propios comentarios dicen evitar — la interfaz filtra, el servidor no.
- **La fecha de hoy se rechazaba por futura a primera hora.** El tope del campo se calculaba en la zona de la gestión y la validación comparaba contra el instante UTC. En La Paz, entre medianoche y las ocho de la mañana, el formulario ofrecía «hoy» y la regla lo rechazaba. La causa no era el anclaje sino tener **dos respuestas a «¿qué día es hoy?»**; ahora hay una sola, en `packages/domain/src/civil-date.ts`, y la comparación es por día civil y no por instante.

De los veintitrés descartados, varios describían el código correctamente y aun así no eran defectos: escenarios inalcanzables, invariantes que el sistema no tiene por diseño, o cuestiones ajenas al cambio. Uno señaló algo cierto que queda anotado sin resolver: la referencia bancaria distingue mayúsculas, así que `TRF-88213` y `trf-88213` conviven y PAY-027 no las ve como duplicadas.

## 7.5 Qué falta ahora

### Para cerrar el bloque 1 del todo

1. ~~**Registrar la confirmación.**~~ Hecho el mismo día; ver §8.
2. **`/admin/e/…/pagos`** sigue siendo marcador. La bandeja de comprobantes cubre la revisión; falta la vista de pagos y asignaciones.

### El resto, sin cambios respecto a §5

Bloques 2 a 5 tal como estaban. El orden sigue siendo el acordado.

## 7.6 Cómo retomar

```bash
pnpm db:up
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
pnpm db:fixture revisor@ejemplo.org peregrino@ejemplo.org
pnpm --filter @encuentro/web dev
```

El fixture ahora acepta **dos correos**: el segundo vincula la inscripción a esa cuenta, y su titular puede recorrer `/e/ENC2026/mi-cuenta` con sesión. Deben ser cuentas distintas —quien revisa su propio comprobante se aprueba a sí mismo el dinero— y ambas ya registradas: el script sigue sin crear credenciales.

Los diez pasos que imprime recorren el circuito completo por primera vez: declarar, revisar, pedir corrección, corregir y aprobar.

## 7.7 Lo que no pude verificar

**Ninguna pantalla se recorrió a mano.** El riesgo que §5 dejaba abierto sigue abierto, y ahora abarca dos pantallas más. Con el fixture de dos correos el escenario ya está montado y los diez pasos impresos dicen exactamente qué pulsar; falta hacerlo.

Lo que sí se verificó: **147 pruebas de integración contra Postgres, Redis y MinIO reales** (129 previas más 18 nuevas), y que las dos rutas nuevas se sirven sin error y redirigen a `/ingresar` sin sesión. Más allá de eso no pude llegar: entrar exige crear una cuenta y escribir una contraseña, y eso no lo hago en su nombre.

**La accesibilidad de estas dos pantallas no está comprobada automáticamente.** `tests/e2e/routes.ts` recorre `/e/ENC2026/mi-cuenta/pagos`, pero sin sesión: comprueba la redirección a `/ingresar`, no el formulario. Es el mismo hueco que ya tenían las rutas de administración, y ahora cuesta más dejarlo así, porque estas dos pantallas sí tienen contenido que auditar.

---

# 8. La confirmación de la inscripción

Cierra el pendiente 1 de §7.5, el mismo día. Detalle completo en [`docs/implementation/18-confirmacion-inscripcion.md`](docs/implementation/18-confirmacion-inscripcion.md).

## 8.1 El hueco era mayor de lo que decía §7.3

No era que faltara el llamador. **El puerto `RegistrationConfirmationRepository` no tenía adaptador**: nada debajo. Y **TESORERIA no lleva `registration.update`**, que es el permiso que `confirmRegistration` exige — solo INSCRIPCIONES. Pero en v1 el saldo solo llega a cero al aprobar una evidencia, y eso lo hace tesorería.

Así que no era llamar a una función: era decidir **quién dispara**. REG-017 fija el criterio y no dice quién lo ejecuta. Se consultó al responsable, que eligió **los dos caminos**.

| | Derivado | Manual |
|---|---|---|
| Dónde | dentro de la transacción de `approve()` | `/admin/e/…/inscripciones` |
| Permiso | `payment.proof.review`, el ya validado | `registration.update` |
| Actor | el revisor | quien pulsa |
| Rastro | `registration.confirm` con `derivedFrom` | `registration.confirm` sin él |

Ni permisos nuevos ni migraciones. El derivado no necesita `registration.update` porque no edita la inscripción: aplica una consecuencia que el dominio deriva del dinero. Darle ese permiso a tesorería le habría dado también editar inscripciones en general.

## 8.2 Me equivoqué al describir la carrera, y lo demostró la prueba

Anuncié que el compare-and-swap resolvería el choque entre los dos caminos y que el manual recibiría «la inscripción cambió, recárguela».

**No es así.** El compare-and-swap nunca llega a ejecutarse: el dominio se adelanta, porque `CONFIRMED → CONFIRMED` no es transición legal. Quien pulsara el botón después de que el pago confirmara habría leído *«No existe transición de CONFIRMED a CONFIRMED»*, que describe un error de programación y no lo que pasó.

Corregido: con dos caminos hacia el mismo estado, perder la carrera es un resultado previsto, así que se traduce a conflicto de versión con el mensaje de recarga.

Y en la otra dirección hizo falta `shouldConfirm`, que no lanza nunca: si `decideConfirmation` lanzara dentro de la transacción de aprobación, una inscripción ya confirmada o cancelada **revertiría el cobro entero**. Dos pruebas de integración lo fijan.

## 8.3 Otro defecto de la sesión de esta mañana

`decideConfirmation` también lanza para `DRAFT`: `CONFIRMED` solo se alcanza desde `SUBMITTED`. `findAccountStatement`, commiteado hace unas horas, preguntaba por `DRAFT` y `SUBMITTED` — una inscripción en ese estado habría reventado el estado de cuenta del peregrino.

La revisión adversarial lo había señalado y su verificador lo refutó por inalcanzable. La refutación acertaba sobre la alcanzabilidad de hoy y erraba sobre el código: **`DRAFT` es el valor por defecto de la columna en el esquema**, así que cualquier fila creada sin estado explícito cae ahí. Corregido en los dos sitios.

Vale la pena anotar el patrón: un verificador que pregunta «¿puede darse este escenario hoy?» descarta hallazgos que siguen siendo defectos. La pregunta útil era «¿es correcto este código?».

## 8.4 Qué falta ahora

1. **`/admin/e/…/pagos`** sigue siendo marcador. Es lo último del bloque 1.
2. **Nadie cancela inscripciones.** `CONFIRMED → CANCELLED` es legal y REG-009 dice que cancelar conserva pagos y trazabilidad, pero no hay caso de uso ni pantalla. Cuando lo haya, habrá que decidir qué pasa con el saldo a favor de DEC-007.
3. **El camino manual apenas tiene casos hoy.** Su razón real es la exención total de REG-017, que es alcance aplazado. Conviene revisarlo cuando llegue la caja, que será el segundo disparador del derivado.

Gate: validador, prettier, ESLint, `tsc`, **418 unitarias**, **162 de integración**, `pnpm build`. Sigue sin recorrerse ninguna pantalla a mano.

---

# 9. Revisión de la rama y corrección de hallazgos — 8 de agosto, tarde

## 9.1 La revisión

Siete revisores independientes por subsistema sobre los quince commits de `main..HEAD` —166 archivos, ~16.600 líneas—, y un verificador por hallazgo con el encargo de refutarlo. **41 hallazgos, 33 sobrevivieron.** El informe completo está en [`docs/04-delivery/revision-rama-v2.6.md`](docs/04-delivery/revision-rama-v2.6.md).

Ninguno lo detectaba el gate, que estaba en verde.

Al verificador se le cambió una pregunta respecto a la revisión de la mañana: «¿es correcto este código?» en vez de «¿puede ocurrir hoy?». Sirvió — el hallazgo del archivo huérfano, que el verificador anterior había refutado por inalcanzable, este lo confirmó.

## 9.2 Lo corregido, en once commits

| | |
|---|---|
| **Nadie podía crear una cuenta** | `/ingresar` solo iniciaba sesión. IAM-011 exige el formulario público y estaba en una fase dada por entregada. Sin él, los 600 no pueden llegar a nada |
| **La auditoría la leía cualquiera** | La pantalla no comprobaba permiso alguno. El barrido encontró otras tres igual: eventos, dashboard y configuración |
| **Los comprobantes nacían inverificables** | El token en claro se generaba y se descartaba, y la verificación pública era un stub. Roto por los dos extremos |
| **Dos asignaciones al mismo cargo lo sobreasignaban** | Se validaba línea a línea; ahora se agrupa |
| **La contabilidad se podía vaciar** | `journal_lines` sin triggers ni `REVOKE`, y el cuadre se rendía a cero líneas |
| **El rastro de pagos no llegaba a la auditoría** | `event_id` nulo, y la pantalla filtra por gestión |
| **La carrera de aprobación no se rechazaba** | El saldo se leía fuera de la transacción |
| **Los procesos de fondo fallaban en silencio** | Correos muertos en `SENDING`, correos duplicados, SMTP colgado congelando `HELD`, y un worker inerte que se veía sano |
| **El generador podía destruir la línea base** | `rebuild_package_v2_7.py` devolvía el contrato a 68 requisitos. Desarmado |
| **La renumeración partió los rangos** | ~20 sitios citando requisitos inexistentes, invisibles al validador |
| **Un asiento que se anulaba a sí mismo** | `FINANCIAL_TRANSFER` resolvía ambos lados a la misma cuenta |
| **Documentación que mentía** | El triage daba por operativas pantallas que no escriben nada |

El validador creció de cuatro comprobaciones a nueve: rangos abreviados prohibidos, y cuatro sobre las reglas contables que nadie miraba.

## 9.3 Lo que queda de los 33

Cinco, ninguno de los cuales se puede cerrar sin una decisión o sin infraestructura:

1. **PAY-006, idempotencia.** Ningún comando de cobro acepta clave. Un reintento tras un corte de red da conflicto de versión en vez del mismo resultado. Es diseño, no un parche.
2. **PAY-027 distingue mayúsculas.** `TRX-9981` y `trx-9981` conviven. Exige migrar la columna a `CITEXT` o un índice funcional, normalizar al escribir y alinear el recuento del lado de la revisión.
3. **El archivo huérfano en el almacén.** Una carga rechazada tras guardar el objeto lo deja sin fila que lo apunte. Necesita política de retención, que roza DEC-011.
4. **89 de 163 requisitos sin ninguna cita en código**, con informes de fase que los dan por cubiertos.
5. **El rate limit de la verificación pública.** Caddy no lo trae de serie; hace falta imagen propia con el módulo o límite en la aplicación. El comentario ya no miente, pero la protección no existe.

## 9.4 Lo que no pude verificar, y es mucho

**Docker estuvo caído toda la tarde.** Un socket huérfano —`dockerInference`— impedía arrancar el motor, y el borrado que hacía falta es suyo, no mío.

Consecuencia: **veinticuatro pruebas de integración nuevas sin ejecutar ni una vez**, y **una migración sin aplicar** que además toca triggers de Postgres, que es donde menos vale la intuición. De todas ellas solo sé que compilan, y esta misma mañana una prueba sin correr escondía un constraint que no había leído.

```bash
rm -f "/c/Users/josed/AppData/Local/Docker/run/dockerInference"
# arrancar Docker Desktop, y después:
pnpm db:up && pnpm exec prisma migrate deploy && pnpm test:integration
```

Lo que sí está verde: validador, prettier, ESLint, `tsc`, **424 unitarias**, `prisma validate` y `pnpm build`.

**Y sigue sin recorrerse ninguna pantalla a mano.** El alta pública ya existe, así que el recorrido es posible en cuanto haya base de datos.
