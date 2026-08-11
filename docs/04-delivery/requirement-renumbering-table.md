# Tabla de equivalencias para la renumeración

**Estado:** **APLICADA** en `61a2551`, el 7 de agosto de 2026
**Origen:** [`requirement-migration-v2.6-to-current.md`](requirement-migration-v2.6-to-current.md)
**Alcance ejecutado:** 573 sustituciones en 96 archivos, partiendo de 65 identificadores vigentes

> Esta cabecera decía «PROPUESTA — no aplicada» y «nada de esto se ha aplicado» **en el mismo commit que lo aplicó**. Es el único documento que registra qué identificador se movió a dónde, así que quien lo abriera para desambiguar una cita concluiría que el repositorio sigue en la numeración de v2.7 y leería al revés las ocho familias que colisionan. Corregido el 8 de agosto de 2026.

> El «808 citas» de la estimación tampoco cuadra con las 573 que reportó la ejecución. Se conserva la cifra real y se deja constancia de la diferencia en vez de reescribirla en silencio: la estimación contaba apariciones y la ejecución contó sustituciones efectivas.

## Por qué esta tabla es peligrosa

En las familias que colisionan, una cita **cambia de significado en silencio**. Hoy `PAY-004` junto al código de evidencias designa «la evidencia registra monto, moneda, fecha…». Tras la renumeración, `PAY-004` designa «el webhook autenticado es la fuente de confirmación online», que además está **eliminado** por DEC-015.

No hay error de compilación, no hay prueba que falle. La trazabilidad simplemente empieza a mentir. Por eso el último paso obligatorio es un validador que rechace cualquier identificador ausente del mapa.

## Resumen de la operación

| | Cantidad |
|---|---:|
| Conservan número y significado | **20** |
| Se renumeran a su ID de la base | **22** |
| Son nuevos de v2.7 y reciben número al final de su familia | **23** |
| Se fusionan con otro requisito | **2** |
| **Total vigente** | **65** |

## Tres consecuencias que conviene ver antes de aprobar

**1. La familia `CASH` desaparece.** La v2.6 no tiene prefijo `CASH`: la caja vive dentro de `PAY`. Los dos requisitos vigentes vuelven a `PAY-011` y `PAY-012`.

**2. `FOOD` vuelve a llamarse `FOD`.** Cuatro requisitos cambian de prefijo. Es un renombrado puro, sin cambio de significado.

**3. Dos requisitos vigentes se fusionan en uno.** `EVT-007` y `EVT-008` son las dos mitades de `EVT-016`; `FOOD-002` cubre a la vez `FOD-006` y `FOD-007`.

---

## GOV — sin cambios (10)

`GOV-001` … `GOV-010` conservan número y significado.

## EVT (10 vigentes)

| Vigente | Pasa a ser | Tipo |
|---|---|---|
| EVT-001 … EVT-006 | sin cambio | conserva |
| EVT-007 | **EVT-016** | fusión |
| EVT-008 | **EVT-016** | fusión |
| EVT-009, EVT-010 | sin cambio | conserva |

## PKG (5 vigentes)

| Vigente | Pasa a ser | Tipo |
|---|---|---|
| PKG-001 | sin cambio | conserva |
| PKG-002 | **PKG-009** | renumera |
| PKG-003 | **PKG-010** | renumera |
| PKG-004 | **PKG-012** | nuevo (DEC-002) |
| PKG-005 | **PKG-013** | nuevo (DEC-002) |

## REG (8 vigentes)

| Vigente | Pasa a ser | Tipo |
|---|---|---|
| REG-001 | **REG-019** | nuevo (DEC-002, modalidad) |
| REG-002 | **PAY-001** | renumera — «cargo inmutable/versionado» es de la familia PAY en la base |
| REG-003 | **REG-020** | nuevo (DEC-002, mínimo del 50%) |
| REG-004 | **REG-021** | nuevo (DEC-009, comprobante en plazo) |
| REG-005 | **REG-022** | nuevo (DEC-002, saldo sin repricing) |
| REG-006 | **REG-023** | nuevo (DEC-004, sin prorrateo) |
| REG-007 | **PKG-011** | renumera |
| REG-008 | **HOS-015** | nuevo — pertenece a hospedaje, no a inscripción |

## PAY (15 vigentes)

| Vigente | Pasa a ser | Tipo |
|---|---|---|
| PAY-001 | **PAY-022** | nuevo (DEC-002/DEC-015, pagos manuales) |
| PAY-002 | **PAY-023** | nuevo (canales anticipados) |
| PAY-003 | **PAY-024** | nuevo (canales al llegar) |
| PAY-004 | **PAY-018** | renumera — evidencias privadas con checksum |
| PAY-005 | **PAY-025** | nuevo |
| PAY-006 | **PAY-026** | nuevo |
| PAY-007 | **PAY-027** | nuevo |
| PAY-008 | **PAY-002** | renumera |
| PAY-009 | **PAY-028** | nuevo (DEC-003) |
| PAY-010 | **PAY-014** | renumera — secuencia de recibos |
| PAY-011 … PAY-014 | **PAY-029 … PAY-032** | nuevos (DEC-003, contenido del comprobante) |
| PAY-015 | **PAY-033** | nuevo (DEC-003, comprobante inmutable) |

## CASH (2 vigentes) — la familia desaparece

| Vigente | Pasa a ser | Tipo |
|---|---|---|
| CASH-001 | **PAY-011** | renumera |
| CASH-002 | **PAY-012** | renumera |

## HOS (8 vigentes)

| Vigente | Pasa a ser | Tipo |
|---|---|---|
| HOS-001 | **HOS-011** | renumera |
| HOS-002 | **HOS-013** | renumera |
| HOS-003 | **HOS-012** | renumera |
| HOS-004 | **HOS-003** | renumera |
| HOS-005 | **HOS-016** | nuevo (DEC-002) |
| HOS-006 | **HOS-017** | nuevo (DEC-002) |
| HOS-007 | **HOS-001** | renumera |
| HOS-008 | **HOS-002** | renumera |

> Atención: `HOS-001`, `HOS-002` y `HOS-003` existen en ambos lados con significados distintos. **La renumeración debe hacerse en una sola pasada con marcadores intermedios**, o una sustitución pisará a la otra.

## FOOD → FOD (4 vigentes)

| Vigente | Pasa a ser | Tipo |
|---|---|---|
| FOOD-001 | **FOD-001** | renombra prefijo |
| FOOD-002 | **FOD-006** | fusión (cubre también FOD-007) |
| FOOD-003 | **FOD-002** | renumera |
| FOOD-004 | **FOD-003** | renumera |

## MAT (3 vigentes)

| Vigente | Pasa a ser | Tipo |
|---|---|---|
| MAT-001 | **MAT-005** | nuevo (elegibilidad por paquete, inventario e historial) |
| MAT-002 | **MAT-004** | renumera |
| MAT-003 | sin cambio | conserva — se le restituye «sobrantes» |

---

## Procedimiento ejecutado

Los siete pasos se completaron el 7 de agosto de 2026, salvo lo que se indica.

1. ✅ **Congelado el trabajo sobre requisitos** mientras duró la operación.
2. ✅ Tabla aplicada a `docs/01-product/requirements.md` y `contracts/requirements.json`.
3. ⚠️ Propagación a las citas. **No salió en una sola pasada.** La primera usó `git ls-files`, que solo lista archivos versionados, y dejó fuera diez ficheros sin versionar; al reejecutar, los versionados ya correctos se renumeraron **por segunda vez**, y los ocho identificadores que son a la vez origen y destino se movieron dos veces. Se regeneraron 33 archivos desde `HEAD` aplicando el mapa una sola vez. El relato completo está en `handoff.md` §4.
4. ✅ Validador ampliado. Hoy comprueba cuatro cosas, no una: que `requirements.md` y `requirements.json` declaren el mismo conjunto, que no haya huérfanos en los mapas de fase y prompt, que todo requisito tenga ambos, y que ninguna cita apunte a un requisito inexistente. El 8 de agosto se añadió la quinta —ningún rango abreviado— por lo que se explica abajo.
5. ✅ Gate completo ejecutado.
6. ✅ Corregido el «185».
7. ✅ `requirements-candidates-v26.md` archivado.

## Lo que la operación rompió y no se vio hasta el 8 de agosto

**Los rangos abreviados quedaron partidos por la mitad.** El script sustituía identificadores completos, y en un rango como `HOS-001..008` el número de la derecha no lleva prefijo: no se tocó. El resultado fue `HOS-011..008`, un rango descendente, y una veintena de casos parecidos que citaban requisitos inexistentes (`FOD-004`, `PKG-005`, `PAY-015`, `HOS-008`…). La comprobación 4 del validador no los veía, porque un número huérfano no es una cita.

Y la renumeración **rompió la contiguidad**, así que ya no existe ningún rango de requisitos válido: `REG-001..005` es hoy REG-019, PAY-001, REG-020, REG-021 y REG-022, cinco identificadores de tres familias. Los veinte sitios se expandieron a listas explícitas y el validador rechaza desde entonces la sintaxis de rango para familias de requisitos.

## Pendiente de decisión antes de empezar

`EVT-007` y `EVT-008` **de la base** —«una gestión futura puede existir en `DRAFT` o `READY`» y «la clonación copia únicamente configuración versionada»— siguen sin decisión de alcance. Sus números quedan ocupados por la base en cualquier caso, así que **no bloquean la renumeración**, pero conviene resolverlos antes de escribir el requisito definitivo.
