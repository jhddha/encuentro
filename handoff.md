# Handoff — sesión del 7–8 de agosto de 2026

**Rama:** `migracion-linea-base-v2.6`, doce commits por delante de `main` (`626ad05`), subida a GitHub, árbol limpio.
**Gate al cerrar:** validador, prettier, ESLint, `tsc --build`, **345 unitarias**, **129 de integración**, `pnpm build`. Todo en verde.

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
