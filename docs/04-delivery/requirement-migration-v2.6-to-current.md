# Migración de requisitos v2.6 → versión actual

**Estado:** EN PROCESO
**Fuente:** `Encuentro_Requisitos_y_Reglas_v2.6.docx` (185 requisitos) + `Actualizacion_Canonica_DEC004.docx` (13 requisitos)
**Referencia actual:** 65 requisitos en `contracts/requirements.json`

## Decisiones de método ya tomadas

| # | Decisión | Fecha |
|---|---|---|
| M-01 | **La numeración de v2.6 manda.** La v2.7 reutilizó identificadores para requisitos distintos; se restituye la numeración original y los requisitos genuinamente nuevos reciben números al final de su familia. | 2026-08-05 |
| M-02 | **La línea base son 198 requisitos**: los 185 de v2.6 más los 13 del parche DEC-004, que continúan la numeración sin huecos ni solapes. Hay que corregir el «185» de `SOURCE_GAPS.md`, `PACKAGE_STATUS.md` y `README.md`. | 2026-08-05 |
| M-03 | **Método de revisión:** el agente resuelve los emparejamientos inequívocos; los dudosos se consultan por familia con el texto de ambas versiones a la vista. | 2026-08-05 |

## Resumen cuantitativo

| Métrica | Cantidad |
|---|---:|
| Línea base (v2.6 + parche DEC-004) | **198** |
| Requisitos vigentes en el contrato | 65 |
| Con el mismo ID en ambas versiones | 59 |
| …de los cuales el ID designa **requisitos distintos** | ~42 |
| **Clasificados** | **198 de 198** — verificado por script, ningún ID sin estado |

### Distribución final

| Clasificación | Cantidad |
|---|---:|
| `CONSERVADO` | 40 |
| `MODIFICADO` | 15 |
| `REEMPLAZADO` | 11 |
| `ELIMINADO_POR_DECISION_APROBADA` | **4** |
| `PENDIENTE_DE_MIGRACION` | 128 |

Las **cuatro** eliminaciones son las únicas con evidencia explícita: `PAY-003`, `PAY-004` y `PAY-005` por **DEC-015** (sin checkout automático) y `PAY-015` por **DEC-007** (sin devoluciones). Ningún requisito se dio por eliminado por el mero hecho de no aparecer en la v2.7.

### Reparto de alcance de los 128 pendientes

| Decisión | Cantidad |
|---|---:|
| Entran en v1 | **82** |
| Alcance aplazado | 44 |
| **Sin decisión de alcance todavía** | **2** |

Los dos sin decidir son `EVT-007` («una gestión futura puede existir en `DRAFT` o `READY`») y `EVT-008` («la clonación copia únicamente configuración versionada»). Están clasificados, pero no se tomó decisión de alcance sobre ellos. **La clonación de gestiones es una funcionalidad completa que hoy no existe en ninguna parte.**

## Reglas de clasificación

- `CONSERVADO`: mismo significado y criterio de aceptación; cambia solo la redacción.
- `MODIFICADO`: mantiene identidad, pero el alcance o el criterio cambió.
- `REEMPLAZADO`: una decisión aprobada lo sustituye por otro requisito identificado.
- `PENDIENTE_DE_MIGRACION`: existe en la base y no está representado.
- `CONFLICTO`: dos fuentes vigentes indican comportamientos incompatibles.
- `ELIMINADO_POR_DECISION_APROBADA`: hay evidencia explícita de eliminación. **No basta con que no aparezca en v2.7.**

---

## GOV — Invariantes transversales (10/10 clasificados)

| ID base | Estado | ID vigente | Resolución |
|---|---|---|---|
| GOV-001 | `CONSERVADO` | GOV-001 | «pertenece a un `event_id`» y «pertenece a una gestión» son la misma regla |
| GOV-002 | `CONSERVADO` | GOV-002 | Reescritura sin cambio de alcance |
| GOV-003 | `CONSERVADO` | GOV-003 | Texto prácticamente idéntico |
| GOV-004 | `CONSERVADO` | GOV-004 | Reescritura sin cambio de alcance |
| GOV-005 | `CONSERVADO` | GOV-005 | Texto idéntico |
| GOV-006 | `MODIFICADO` | GOV-006 | v2.7 añade versión e idempotencia y omite «en servidor». **Decisión: prevalece el texto vigente**; la regla `03-security-rbac` ya exige la validación en servidor |
| GOV-007 | `CONSERVADO` | GOV-007 | «el correo es global» y «SMTP, reglas y plantillas son globales» son la misma regla |
| GOV-008 | `CONSERVADO` | GOV-008 | Reescritura sin cambio de alcance |
| GOV-009 | `MODIFICADO` | GOV-009 | v2.6 lo enunciaba sobre «entidades auditables»; v2.7 lo fija en una lista de seis. **Decisión: prevalece el texto vigente.** Riesgo asumido: una entidad auditable futura queda fuera si nadie la añade a la lista |
| GOV-010 | `MODIFICADO` | GOV-010 | v2.7 lo redujo a las decisiones `BLOCKING`. **Decisión: se restaura la redacción amplia de v2.6** — «el agente no resuelve decisiones abiertas» —, porque el texto vigente permitiría al agente cerrar por su cuenta una decisión abierta no bloqueante |

### Acción pendiente en GOV

- Reescribir GOV-010 en `docs/01-product/requirements.md` con la redacción de v2.6, conservando como criterio verificable el que ya tiene («el validador y los prompts detienen el alcance dependiente»).

---

## EVT — Gestión y configuración (17 en la base)

| ID base | Estado | ID vigente | Resolución |
|---|---|---|---|
| EVT-001 | `MODIFICADO` | EVT-001 | v2.7 omite «en `DRAFT`». **Decisión: prevalece el texto vigente**; el estado inicial queda garantizado por el esquema |
| EVT-002 | `MODIFICADO` | EVT-002 | v2.7 añade duración y noches (DEC-004) y omite «responsables». **Decisión: prevalece el texto vigente** |
| EVT-003 | `CONSERVADO` | EVT-003 | Texto idéntico |
| EVT-004 | `CONSERVADO` | EVT-004 | Reescritura sin cambio de alcance |
| EVT-005 | `MODIFICADO` | EVT-005 | v2.7 omitió «credencial». **Decisión: se restaura**, por ser un módulo completo del sistema (familia QR) |
| EVT-006 | `MODIFICADO` | EVT-006 | v2.7 suprime «por defecto» y la vuelve absoluta. **Decisión: prevalece el texto vigente**, que es lo que el índice único parcial ya impone |
| EVT-007 | `PENDIENTE_DE_MIGRACION` | — | «Una gestión futura puede existir en `DRAFT` o `READY`». El ID vigente designa otra cosa |
| EVT-008 | `PENDIENTE_DE_MIGRACION` | — | «La clonación copia únicamente configuración versionada». **Funcionalidad completa ausente** |
| EVT-009 | `CONSERVADO` | EVT-009 | Reescritura sin cambio de alcance |
| EVT-010 | `CONSERVADO` | EVT-010 | v2.7 omite «del checklist»; misma regla |
| EVT-011 | `PENDIENTE_DE_MIGRACION` | — | Excepción posterior al cierre con alcance, motivo, aprobador y vencimiento. **Aplazado**, por coherencia con `PAY-013` (reapertura de caja) |
| EVT-012 | `PENDIENTE_DE_MIGRACION` | — | El cierre financiero solo ocurre tras el operativo. **Entra en v1.** Ya implementado: `OPERATIONALLY_CLOSED: ['FINANCIALLY_CLOSED']` en `states.ts` |
| EVT-013 | `PENDIENTE_DE_MIGRACION` | — | Checklist del cierre financiero. **Aplazado**: exige rendiciones y reembolsos resueltos, que son `ACC-008` y `ACC-010`, aplazados hasta DEC-018 |
| EVT-014 | `PENDIENTE_DE_MIGRACION` | — | `ARCHIVED` es solo lectura. **Entra en v1.** A medias: `ARCHIVED: []` impide transiciones, pero el código `EVENT_ARCHIVED` no existe |
| EVT-015 | `PENDIENTE_DE_MIGRACION` | — | Selector de gestión obligatorio en paneles privados. **Entra en v1.** A medias: las rutas ya llevan `eventCode`; falta limpiar filtros y caché al cambiar |
| EVT-016 | `REEMPLAZADO` | EVT-007 + EVT-008 | Los dos IDs vigentes son las dos mitades de este requisito del parche DEC-004; se fusionan aquí |
| EVT-017 | `PENDIENTE_DE_MIGRACION` | — | Hospedaje y Alimentos derivan las fechas de la gestión conservando configuraciones versionadas propias. **Entra en v1**: es la contrapartida de `HOS-014` |

---

## PKG — Catálogo y precios (11 en la base)

| ID base | Estado | ID vigente | Resolución |
|---|---|---|---|
| PKG-001 | `MODIFICADO` | PKG-001 | v2.7 fusiona pertenencia a gestión con versionado histórico |
| PKG-002 | `CONSERVADO` | PKG-001 (criterio) | «Precios versionados» queda dentro del requisito vigente |
| PKG-003 | `PENDIENTE_DE_MIGRACION` | — | Beneficios estructurados. **Decisión: entra en v1** |
| PKG-004 | `CONSERVADO` | PKG-001 (criterio) | «Cambiar precio no altera cargos existentes» es el criterio del vigente |
| PKG-005 | `REEMPLAZADO` | — | Era un *gate* de DEC-004; resuelto por PKG-011 |
| PKG-006 | `PENDIENTE_DE_MIGRACION` | — | **Descuentos y becas. Sin representación y sin DEC que lo excluya.** Decisión de alcance aplazada |
| PKG-007 | `PENDIENTE_DE_MIGRACION` | — | Total en servidor con Decimal. Hoy es prosa en §10, no requisito verificable. Decisión aplazada |
| PKG-008 | `PENDIENTE_DE_MIGRACION` | — | Rechazo con `BENEFIT_NOT_INCLUDED`. **Decisión: entra en v1** |
| PKG-009 | `CONSERVADO` | PKG-002 | El ID vigente designa este requisito del parche |
| PKG-010 | `CONSERVADO` | PKG-003 | El ID vigente designa este requisito del parche |
| PKG-011 | `CONSERVADO` | REG-007 | «Sin tarifa tardía automática» vive hoy en la familia REG |

**Nuevos de v2.7 sin origen en la base** (nacen de DEC-002, reciben número al final de la familia):

| ID vigente | Requisito | ID propuesto |
|---|---|---|
| PKG-004 | Tarifa anticipada y tarifa normal como montos explícitos | `PKG-012` |
| PKG-005 | La tarifa anticipada tiene inicio/fin, moneda, mínimo de pago y vencimiento | `PKG-013` |

---

## REG — Inscripción (18 en la base)

**La familia más dañada.** Los 18 de la base y los 8 vigentes son conjuntos casi disjuntos: los vigentes nacen de DEC-002, DEC-004 y DEC-009, y desplazaron a los originales sin sustituirlos.

| ID base | Estado | Resolución |
|---|---|---|
| REG-015 | `REEMPLAZADO` | Era el *gate* de menores; resuelto por **DEC-006** |
| REG-009 | `PENDIENTE_DE_MIGRACION` | Cancelar no elimina pagos, cargos ni QR. **Entra en v1** |
| REG-010 | `PENDIENTE_DE_MIGRACION` | Check-in con actor, estación, fecha y gestión; doble check-in idempotente. **Entra en v1** |
| REG-011 | `PENDIENTE_DE_MIGRACION` | `NO_SHOW` solo tras el final del evento o por acción autorizada. **Entra en v1** |
| REG-017 | `PENDIENTE_DE_MIGRACION` | **`CONFIRMED` exige saldo cero o exención aprobada; el pago parcial permanece `SUBMITTED`. Entra en v1** |
| REG-018 | `PENDIENTE_DE_MIGRACION` | Un beneficio ya entregado no se elimina retroactivamente al cambiar de paquete. **Entra en v1** |
| REG-002, 003, 005, 014 | `PENDIENTE_DE_MIGRACION` | Campos mínimos, borrador reanudable, detección de duplicados y fusión auditada. **Alcance aplazado** |
| REG-012, 013, 016 | `PENDIENTE_DE_MIGRACION` | Panel con datos propios (IDOR), búsqueda presencial, una cuenta por inscripción. **Alcance aplazado** |
| REG-001, 004, 006, 007, 008 | `PENDIENTE_DE_MIGRACION` | Cubiertos de hecho por el esquema o por otros requisitos, sin requisito propio. **Alcance aplazado** |

### Hallazgo crítico

`REG-017` es **la única regla que define cuándo una inscripción pasa a `CONFIRMED`**. Se verificó en el código: existe `unlocksHotelSelection` para el mínimo del 50% (DEC-002), pero **no hay ninguna función que decida la confirmación**. El flujo de inscripción no cierra porque el requisito que lo gobierna no está en el contrato.

No hay conflicto con DEC-002: pagar el 50% habilita elegir hotel y la inscripción sigue `SUBMITTED` hasta saldar. Ambas reglas conviven.

### Riesgo registrado

`REG-012` (panel del peregrino solo con datos propios, prueba IDOR negativa) queda fuera de v1 por decisión de alcance. La regla `.claude/rules/03-security-rbac` lo exige igualmente, pero **sin requisito no hay criterio verificable ni prueba obligatoria**.

---

## PAY — Pagos, cajas y comprobantes (21 en la base)

Primera familia con eliminaciones respaldadas por evidencia.

| ID base | Estado | Resolución |
|---|---|---|
| PAY-003 | `ELIMINADO_POR_DECISION_APROBADA` | Integración por `PaymentProvider`. **DEC-015** cerró el alcance y v1 no tiene checkout automático |
| PAY-004 | `ELIMINADO_POR_DECISION_APROBADA` | Webhook autenticado como fuente de confirmación. Ídem |
| PAY-005 | `ELIMINADO_POR_DECISION_APROBADA` | Unicidad `provider + external_event_id`. Ídem |
| PAY-015 | `ELIMINADO_POR_DECISION_APROBADA` | Reembolso con asiento de reversión. **DEC-007**: v1 no devuelve dinero |
| PAY-008 | `REEMPLAZADO` | Era un *gate* de sobrepago; resuelto por **DEC-008** |
| PAY-010 | `REEMPLAZADO` | Era un *gate* de tipo de cambio; resuelto por **DEC-009** |
| PAY-001 | `CONSERVADO` | Vive hoy como el `REG-002` vigente |
| PAY-002 | `CONSERVADO` | Vive hoy como el `PAY-008` vigente |
| PAY-011 | `CONSERVADO` | Vive hoy como `CASH-001` |
| PAY-012 | `CONSERVADO` | Vive hoy como `CASH-002` |
| PAY-014 | `CONSERVADO` | Vive hoy como el `PAY-010` vigente |
| PAY-018 | `CONSERVADO` | Vive hoy como el `PAY-004` vigente |
| PAY-007 | `CONSERVADO` | Cubierto por `GOV-009` |
| PAY-016 | `CONSERVADO` | Cubierto por `GOV-004` |
| PAY-017 | `CONSERVADO` | Cubierto por `GOV-008` |
| PAY-009 | `MODIFICADO` | Multimoneda con moneda, tasa y fecha; acotado por **DEC-009** |
| PAY-006 | `PENDIENTE_DE_MIGRACION` | *Idempotency key* en todo comando de cobro. **Entra en v1** |
| PAY-019 | `PENDIENTE_DE_MIGRACION` | Sin importes negativos. **Entra en v1** |
| PAY-020 | `PENDIENTE_DE_MIGRACION` | Asignación acotada al saldo. **Entra en v1**; el dominio ya lo cumple con `assertAllocationsWithinPayment` |
| PAY-021 | `PENDIENTE_DE_MIGRACION` | Autoservicio solo paga cargos propios. **Entra en v1** |
| PAY-013 | `PENDIENTE_DE_MIGRACION` | Reapertura de caja con doble autorización. **Alcance aplazado**; hoy no existe reapertura |

**Nuevos de v2.7 sin origen en la base** (DEC-002, DEC-003, DEC-015): canales de pago manual, ciclo de evidencia y revisión, y el detalle del comprobante. Reciben números al final de la familia.

---

## HOS — Hospedaje (14 en la base)

Casi toda la familia vigente son en realidad requisitos del parche DEC-004 llevando otro número.

| ID base | Estado | Resolución |
|---|---|---|
| HOS-011 | `CONSERVADO` | Vive hoy como el `HOS-001` vigente |
| HOS-012 | `CONSERVADO` | Vive hoy como el `HOS-003` vigente |
| HOS-013 | `CONSERVADO` | Vive hoy como el `HOS-002` vigente |
| HOS-002 | `CONSERVADO` | Reserva atómica sin contador; vive hoy como el `HOS-008` vigente |
| HOS-003 | `MODIFICADO` | «`HELD` vence según configuración»; acotado a 30 minutos por **DEC-005** |
| HOS-004 | `CONSERVADO` | Cubierto por `HOS-013` |
| HOS-009 | `REEMPLAZADO` | Era el *gate* de la política de retención; resuelto por **DEC-005** |
| HOS-001 | `CONSERVADO` | Hoteles, tipos, habitaciones y capacidad; presente en el esquema y en el `HOS-007` vigente |
| HOS-005 | `PENDIENTE_DE_MIGRACION` | Cambio de habitación atómico. **Entra en v1**: el índice único parcial sobre `(room_id, bed_index)` lo exige de hecho |
| HOS-006 | `PENDIENTE_DE_MIGRACION` | Sobreasignación manual con permiso, motivo y advertencia. **Entra en v1**: el permiso `lodging.override_capacity` ya existe sin ninguna regla que lo gobierne |
| HOS-014 | `PENDIENTE_DE_MIGRACION` | Fuente única versionada de la configuración de noches. **Entra en v1**: hoy la mencionan `EVT-002` y `HOS-011`, que son dos fuentes |
| HOS-007 | `PENDIENTE_DE_MIGRACION` | Umbrales de cupo con aviso. **Aplazado**: depende de un disparador de notificación que no existe |
| HOS-008 | `PENDIENTE_DE_MIGRACION` | Inscrito sin hospedaje como pendiente operativo. **Aplazado**: requiere una vista que no existe |
| HOS-010 | `PENDIENTE_DE_MIGRACION` | Reportes por hotel/habitación limitan PII. **Aplazado**: revisar primero la familia `RPT`, puede estar duplicado |

**Nuevos de v2.7 sin origen en la base** (DEC-002): elección de hotel tras aprobación del anticipo, y pago al llegar sin reserva anticipada.

---

## FOD y MAT — Alimentos y materiales (8 y 4 en la base)

| ID base | Estado | Resolución |
|---|---|---|
| FOD-001 | `CONSERVADO` | Vive hoy como `FOOD-001` |
| FOD-002 | `CONSERVADO` | Vive hoy como `FOOD-003` |
| FOD-003 | `CONSERVADO` | Vive hoy como `FOOD-004` |
| FOD-006, FOD-007 | `CONSERVADO` | Ventana y disponibilidad; cubiertos por `FOOD-002` |
| FOD-005 | `PENDIENTE_DE_MIGRACION` | Origen comprado, donado o pendiente. **Entra en v1**: sin él, las reglas contables `PURCHASE_PAID_IMMEDIATELY` e `IN_KIND_DONATION_INVENTORY` no se pueden aplicar |
| FOD-004 | `PENDIENTE_DE_MIGRACION` | Reportes con cantidades, no nombres. **Aplazado**: los reportes no existen |
| FOD-008 | `PENDIENTE_DE_MIGRACION` | Captura offline con `captured_at` validado. **Aplazado**: revisar primero la familia `QR`, puede estar duplicado |
| MAT-001 | `CONSERVADO` | Movimientos de inventario; vive hoy como el `MAT-003` vigente |
| MAT-004 | `CONSERVADO` | Llegada tardía; vive hoy como el `MAT-002` vigente |
| MAT-002 | `PENDIENTE_DE_MIGRACION` | Entrega de kit única por tipo y persona salvo override. **Entra en v1** por simetría con `FOOD-004`, que ya lo exige para comidas |
| MAT-003 | `MODIFICADO` | **Entra en v1 la restitución de «sobrantes»** |

### Hallazgo

`MAT-003` de v2.6 decía «entradas, salidas, ajustes, pérdidas y **sobrantes**». El vigente dice «…y **entregas**». Se sustituyó una palabra por otra y el movimiento de sobrante desapareció del contrato. El borrador contable del paquete `docs/_incoming/correccion-documental-contable` señala precisamente la falta de una regla para el sobrante de inventario, como si hubiera que inventarla: **el requisito existía**.

---

## IAM y AUD — Identidad, permisos y auditoría (12 y 4 en la base)

**Ninguna de las dos familias tiene un solo requisito en el contrato vigente**, pero **12 de los 16 ya están construidos**: P04 y P03 los implementaron sin tenerlos delante. Recuperarlos es sobre todo escribir el requisito y su prueba.

**Decisión: se recuperan las dos familias completas**, con dos recortes justificados.

| ID base | Estado | Resolución |
|---|---|---|
| IAM-006 | `REEMPLAZADO` | Era un *gate* de segundo factor; resuelto por **DEC-014** |
| IAM-001, 002, 005, 007, 008, 010, 011, 012 | `PENDIENTE_DE_MIGRACION` | **Entran en v1.** Ya implementados; falta el requisito y su criterio |
| IAM-003 | `MODIFICADO` | **Entra en v1 sin la vigencia.** `role_assignments` tiene alcance pero ninguna columna de vigencia, y no hay ningún caso de uso de roles con caducidad en el proyecto. La vigencia queda como pendiente con nota |
| IAM-004 | `PENDIENTE_DE_MIGRACION` | Rate limit y auditoría en acceso. **Entra en v1.** Verificado: `auth.ts` configura `session`, `advanced` y `plugins`, pero **no configura `rateLimit`** |
| IAM-009 | `PENDIENTE_DE_MIGRACION` | `LAST_ADMIN_REQUIRED`. **Entra en v1.** Verificado: no existe en el código. Hoy el único administrador global puede retirarse a sí mismo el acceso y dejar el sistema sin nadie que pueda entrar |
| AUD-001, AUD-003, AUD-004 | `PENDIENTE_DE_MIGRACION` | **Entran en v1.** Ya implementados: trigger append-only, redacción probada y permiso `audit.read` |
| AUD-002 | `MODIFICADO` | **Entra en v1 sin la cláusula de impersonación**, porque el sistema no tiene función de impersonar. **Sí entra la IP**: `sessions` la registra, `audit_logs` no |

---

## ACC — Contabilidad (16 en la base)

Ningún requisito `ACC` está en el contrato vigente. La familia existía entera desde v2.6.

| ID base | Estado | Resolución |
|---|---|---|
| ACC-001 | `PENDIENTE_DE_MIGRACION` | Partida doble, no fiscal. **Entra en v1.** Ya implementado: trigger `journal_entry_must_balance` |
| ACC-002 | `PENDIENTE_DE_MIGRACION` | Idempotencia `source_type + source_id + entry_kind`. **Entra en v1.** No implementado: faltan la columna `entry_kind` y el índice único |
| ACC-003 | `PENDIENTE_DE_MIGRACION` | Asiento contabilizado no se edita. **Entra en v1.** Ya implementado: triggers `journal_entries_no_update` y `no_delete` |
| ACC-013 | `CONSERVADO` | Sin presupuestos ni centros de costo en v1; ya está en las exclusiones de `requirements.md` §2 |
| ACC-015 | `PENDIENTE_DE_MIGRACION` | El cierre financiero bloquea asientos ordinarios; ajustes por periodo de ajuste. **Entra en v1** |
| ACC-016 | `PENDIENTE_DE_MIGRACION` | AUDITOR con lectura sin aprobar ni modificar. **Entra en v1** |
| ACC-004 | `PENDIENTE_DE_MIGRACION` | **Es el *gate* contable.** «Conforme a política aprobada». **Aplazado hasta DEC-018** |
| ACC-005 … ACC-012, ACC-014 | `PENDIENTE_DE_MIGRACION` | Donaciones, egresos, desembolsos, rendiciones, reembolsos, activos, conciliación y clasificación. **Aplazados hasta DEC-018**: todos dependen de qué cuenta se debita |

### Hallazgo: el bloqueo contable ya estaba declarado en v2.6

`ACC-004` dice que los ingresos nacen de pagos y asignaciones **«conforme a política aprobada»**. La v2.6 ya declaraba que esa política no existía. No fue un descuido de la consolidación v2.7: era un hueco conocido desde el origen.

Eso **acota DEC-018 con precisión**: solo debe resolver el plan de cuentas y la matriz operación→asiento. El resto de la estructura contable —cuadre, inmutabilidad, idempotencia, cierre, lectura del auditor— ya estaba especificado.

### Defecto detectado en el paquete `docs/_incoming/correccion-documental-contable`

La llave de idempotencia canónica de `ACC-002` es `source_type + source_id + entry_kind`. El paquete propone `event_id + source_type + source_id + entry_kind + **version**`.

**Incluir la versión de la regla rompe la idempotencia.** Si una fuente se contabiliza con la regla v1 y las reglas suben después a v2, la llave cambia y la misma operación puede contabilizarse por segunda vez — exactamente lo que `ACC-002` impide.

Añadir `event_id` sí es correcto: lo exige `GOV-001`. Añadir `version` debe rechazarse al aprobar DEC-018.

---

## NTF — Notificaciones (15 en la base)

| ID base | Estado | Resolución |
|---|---|---|
| NTF-001 | `PENDIENTE_DE_MIGRACION` | Único `smtp_settings` global. **Entra en v1.** Implementado en P16 |
| NTF-005 | `PENDIENTE_DE_MIGRACION` | Plantillas globales, versionadas, con validación de variables. **Entra en v1.** Implementado en P16 |
| NTF-008 | `PENDIENTE_DE_MIGRACION` | Trabajos idempotentes en worker. **Entra en v1.** Implementado en P16 |
| NTF-009 | `PENDIENTE_DE_MIGRACION` | Backoff en fallo temporal, *dead-letter* en permanente. **Entra en v1.** Implementado en P16 |
| NTF-002 | `PENDIENTE_DE_MIGRACION` | Solo ADMIN_MASTER modifica SMTP, reglas y plantillas. **Entra en v1** |
| NTF-003 | `MODIFICADO` | **Entra en v1 con divergencia registrada.** v2.6 pide cifrar la contraseña SMTP con clave externa a la base; P16 la mantiene **fuera de la base por completo**, en el entorno. Cumple el fin por otra vía |
| NTF-015 | `PENDIENTE_DE_MIGRACION` | Deshabilitar el correo no deshabilita notificaciones internas ni negocio. **Entra en v1** |
| NTF-004, 006, 007, 010, 011, 012, 013, 014 | `PENDIENTE_DE_MIGRACION` | **Aplazados.** Todos dependen de un motor de reglas de notificación —tipos, canales, roles, prioridad, obligatoriedad— que no existe |

---

## QR — Credenciales y operación offline (13 en la base)

**Decisión: se recupera la familia completa.** El escáner offline está dentro del alcance de v1 —la ruta `/scanner/e/[eventCode]/[stationCode]` está en `routes.json` y `requirements.md` §10 exige idempotencia en la sincronización offline— y hoy **no hay un solo requisito que lo gobierne**. Es el mismo patrón que `lodging.override_capacity`: un módulo permitido sin regla.

| ID base | Estado | Nota |
|---|---|---|
| QR-001, 002, 003, 005, 010 | `PENDIENTE_DE_MIGRACION` | **Entran en v1.** Ya implementados en P08: token opaco por hash, revocación, estaciones, servidor autoritativo y entrega única por constraint |
| QR-004, 006, 007, 008, 009, 011, 012, 013 | `PENDIENTE_DE_MIGRACION` | **Entran en v1.** Gobiernan la operación offline: UUID idempotente con `captured_at`, ventana segura de sincronización, rechazo tras el cierre, desconfianza del reloj del dispositivo, mínimos en IndexedDB, estados visibles, cola local persistente y manifiesto firmado con expiración |

`QR-008` —no confiar en el reloj del dispositivo— es el caso típico de requisito que sin enunciar nadie implementa y que se descubre durante el evento.

### Resolución de un aplazamiento anterior

`FOD-008` (captura offline con `captured_at` validado) queda `REEMPLAZADO` por `QR-004`, `QR-006`, `QR-007` y `QR-008`, que lo cubren con más detalle. Se confirma la sospecha que motivó aplazarlo.

---

## NFR y OBS — No funcionales y observabilidad (15 y 2 en la base)

**Decisión: se recuperan las dos familias completas**, con un ajuste en `OBS-002`.

| ID base | Estado | Resolución |
|---|---|---|
| NFR-008, NFR-009 | `REEMPLAZADO` | Eran *gates* de respaldo y restauración; resueltos por **DEC-012** |
| NFR-010 | `REEMPLAZADO` | Era el *gate* de retención; resuelto por **DEC-011** |
| NFR-001, 004, 005, 006, 013, 014 | `PENDIENTE_DE_MIGRACION` | **Entran en v1.** Ya viven en `requirements.md` §10 como prosa transversal, sin identificador ni criterio verificable |
| NFR-002, NFR-003, NFR-007 | `PENDIENTE_DE_MIGRACION` | **Entran en v1. Son los criterios del go/no-go que faltaban** |
| NFR-011, NFR-012, NFR-015 | `PENDIENTE_DE_MIGRACION` | Navegadores soportados, localización, y migraciones incrementales probadas desde base vacía y con datos. **Entran en v1** |
| OBS-001 | `PENDIENTE_DE_MIGRACION` | Logs con correlation ID, `event_id` y severidad. **Entra en v1** |
| OBS-002 | `MODIFICADO` | Métricas de errores, latencia, colas, SMTP, sincronizaciones y disponibilidad. **Entra en v1 sin la cláusula de *webhooks***, que **DEC-015** dejó fuera de alcance |

### Hallazgo: el pendiente 5 de P14 ya tenía sus umbrales

El informe de hardening registraba «no se ha ejecutado prueba de carga». Los objetivos estaban escritos desde v2.6:

| Requisito | Umbral |
|---|---|
| `NFR-002` | p95 lectura **< 500 ms**; mutación común **< 900 ms** bajo carga aprobada |
| `NFR-003` | Escáner online p95 **< 800 ms**; offline confirma guardado local **< 300 ms** |
| `NFR-007` | OWASP ASVS nivel 2; **los hallazgos críticos o altos bloquean el release** |

---

## SRV y TRN — Servidores y transporte (4 y 8 en la base)

**Decisión: se recuperan las dos familias completas.** Mismo patrón que `QR`: módulos permitidos y sin gobernar. Existen las rutas `/comision/e/[eventCode]/[commissionCode]` y `/admin/e/[eventCode]/transporte`, los permisos `server.*` y `transport.*`, y las tablas `Vehicle` y `Trip` — sin un solo requisito detrás.

| ID base | Estado | Nota |
|---|---|---|
| SRV-001 … SRV-004 | `PENDIENTE_DE_MIGRACION` | **Entran en v1.** Inscripción propia del servidor con comisión, función, horario y vigencia; beneficios validables por QR; estación restringida sin asignación; credencial independiente de la del peregrino |
| TRN-001 … TRN-008 | `PENDIENTE_DE_MIGRACION` | **Entran en v1.** Disponibilidad y capacidad, reevaluación por llegada, datos del traslado, confirmación por QR, carreras extra por concepto, traslado completado inmutable, cierre y alcance del coordinador |

`TRN-005` —«las carreras extra distinguen pagada, donada u otro concepto aprobado»— conecta con las reglas de donación del borrador contable.

Esta familia **sustituye por completo a la familia `TRA`** que el agente había inventado en `requirements-candidates-v26.md`, con texto canónico y criterio de aceptación.

---

## RPT — Reportes (6 en la base)

| ID base | Estado | Resolución |
|---|---|---|
| RPT-001 | `CONSERVADO` | «Todo reporte exige `event_id` explícito»; cubierto por `GOV-001` |
| RPT-002 … RPT-006 | `PENDIENTE_DE_MIGRACION` | **Aplazados.** Comparación entre gestiones, moneda original y base, exportaciones asíncronas con URL temporal, reportes por cantidades y fórmulas del dashboard: describen reportes que todavía no existen |

---

## Cierre de la clasificación

Los **198** requisitos de la línea base están clasificados. Ninguno quedó sin estado ni sin evidencia de procedencia.

### Verificaciones obligatorias de la plantilla

- [x] Se localizaron los identificadores originales — **198**, no 185
- [x] Cada ID tiene exactamente un estado de migración
- [x] Ningún ID fue renumerado sin decisión explícita (decisión M-01)
- [x] Los requisitos equivalentes no están duplicados — se detectaron y resolvieron `FOD-008`↔`QR`, y los `EVT-007`+`EVT-008` vigentes↔`EVT-016`
- [x] Cada requisito modificado o eliminado cita una decisión aprobada
- [x] `requirements.json` y `requirements.md` contienen el mismo conjunto de IDs — lo comprueba el validador
- [x] Los mapas de trazabilidad y fases no contienen IDs huérfanos — lo comprueba el validador
- [x] Todo requisito vigente tiene fase y prompt asignados — lo comprueba el validador
- [x] Ninguna cita del repositorio apunta a un requisito inexistente — lo comprueba el validador

### Estado del contrato

| | |
|---|---:|
| Requisitos en el contrato | **151** |
| Base sin entrada propia | 70 |

De esos 70: quince son `REEMPLAZADO` o `ELIMINADO_POR_DECISION_APROBADA` y no deben tener entrada; el resto son `CONSERVADO` cuyo contenido vive bajo otro identificador, los 44 de alcance aplazado, y `EVT-007` y `EVT-008`, pendientes de decisión.

### Lo que queda por hacer

1. Aplicar la matriz a `docs/01-product/requirements.md` y `contracts/requirements.json` con la numeración de v2.6.
2. Renumerar los requisitos nuevos de v2.7 al final de su familia (`PKG-012`, `PKG-013`, y los de canales de pago, evidencia y comprobante).
3. Actualizar `phase-requirement-map.json`, `prompt-requirement-map.json` y `traceability.md`.
4. Corregir el «185» de `SOURCE_GAPS.md`, `PACKAGE_STATUS.md` y `README.md`.
5. Elevar el total canónico exigido por `scripts/validate_canonical_docs.py`.
6. Archivar `requirements-candidates-v26.md`: queda superado por esta matriz.
7. Abrir **DEC-018** acotada al plan de cuentas y la matriz operación→asiento, **rechazando la inclusión de `version` en la llave de idempotencia**.
