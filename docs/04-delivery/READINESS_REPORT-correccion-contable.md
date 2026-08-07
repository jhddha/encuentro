# READINESS REPORT — Corrección documental y contable

**Fecha:** 5 de agosto de 2026
**Repositorio/commit:** `main` @ `626ad05` (árbol limpio antes de esta sesión)
**Paquete verificado:** `docs/_incoming/correccion-documental-contable/` (9 archivos)
**Responsable de revisión:** pendiente
**Estado recomendado:** `BLOCKED`

> **No se implementó nada del paquete.** No se copiaron sus archivos al árbol documental, no se creó ningún DEC, no se tocó el motor contable y no se generó ningún asiento. Este informe es el resultado de leerlo y verificarlo contra el repositorio.

## 1. Inventario documental

| Elemento | Encontrado | Ubicación | Observaciones |
|---|---|---|---|
| Catálogo v2.6 con 185 requisitos | **No** | — | Sigue ausente. Es el bloqueo de la Parte A |
| Catálogo v2.7 con 65 requisitos | Sí | `contracts/requirements.json` | 65 IDs, verificado por el validador |
| DEC-001 … DEC-005 | Sí | `docs/04-delivery/decisions/` | **Y también DEC-006 a DEC-017** |
| Reglas contables actuales | No existen | — | El motor cuadra asientos; no tiene reglas |
| Plan de cuentas | Parcial | `accounts_chart` | Tiene `code`, `name`, `kind`; **no tiene rol** |
| Validador documental | Sí | `scripts/validate_canonical_docs.py` | 65 IDs, 31 rutas, 55 permisos · exit 0 |
| Integridad del paquete | Sí | `MANIFEST.json` | **9/9 archivos con hash SHA-256 y tamaño correctos** |

El paquete llegó íntegro. Ningún archivo alterado, ninguno de más, ninguno de menos.

## 2. Migración de requisitos

| Clasificación | Cantidad |
|---|---:|
| Total v2.6 encontrado | **0** — la fuente no está en el repositorio |
| Total actual encontrado | 65 |
| Conservados / Modificados / Reemplazados | no clasificable sin la fuente |
| Pendientes de migración | 120 (por aritmética, no por inventario) |
| Conflictos | 1 de procedimiento (ver §6) |
| Eliminados por decisión aprobada | no determinable |

**La Parte A no puede ejecutarse como está escrita.** Su obligación 11 dice: sin el paquete v2.6, detener y reportar qué falta. Lo que falta son los siete documentos canónicos v2.6 originales. `SOURCE_GAPS.md` ya lo dejaba dicho desde antes.

## 3. Reglas contables propuestas

| Métrica | Resultado |
|---|---|
| Reglas existentes en el repositorio | 0 |
| Reglas propuestas en el paquete | **31** (22 con asiento + 9 declaraciones de «no genera asiento») |
| Validación contra su propio esquema | **Correcta.** Sin campos faltantes, sin campos no permitidos, sin `rule_code` duplicados |
| Referencias de reversión rotas | **Ninguna** |
| Reglas sin reversión | 9, todas `NO_ENTRY_*` — correcto, no generan asiento |
| Reglas no monetarias | 2, ambas de donación en especie — correcto |
| Expresión de idempotencia | Una sola, uniforme en las 31 reglas |
| Cobertura de los 20 temas exigidos | **16 completos, 4 con hueco** (ver §5) |

El trabajo es serio: el JSON es consistente consigo mismo y con su esquema, y las 9 declaraciones explícitas de «esto no genera asiento» son justamente la parte que se suele olvidar.

## 4. Defectos concretos encontrados

### 4.1 `GATEWAY_SETTLEMENT` no cuadra

La regla declara un solo débito:

```
debit_account_role:  BANK_ACCOUNT
credit_account_role: PAYMENT_GATEWAY_CLEARING
```

Pero la matriz de la política dice, para esa misma operación:

> Liquidación de pasarela → **Banco y gasto por comisión** → Cuenta transitoria de pasarela

Son **dos débitos**. Cuando la pasarela retiene comisión, el banco recibe menos de lo que salió de la cuenta transitoria, y el asiento tal como está escrito **no cuadraría**. El rol `PAYMENT_PROCESSING_FEES` está declarado en la política y no lo usa ninguna regla — que es exactamente la pieza que falta.

Este es el único defecto que produciría un asiento descuadrado en ejecución.

### 4.2 El bloqueo por sobrepagos ya está resuelto

Dos reglas (`PAYMENT_UNAPPLIED_ADVANCE`, `ADVANCE_APPLIED_TO_REVENUE`) declaran `OVERPAYMENT_AND_REFUND_POLICY` como decisión bloqueante. **Esa decisión ya existe y está aprobada**, por partida doble:

- **DEC-007**: v1 no procesa devoluciones de dinero; la cancelación deja saldo a favor.
- **DEC-008**: el sobrepago no se devuelve ni se reasigna automáticamente; queda como saldo a favor.

Y las reglas ya son coherentes con esas decisiones: la nota de `PAYMENT_UNAPPLIED_ADVANCE` dice literalmente que los sobrepagos son pasivo, no ingreso. **El bloqueo puede levantarse citando DEC-007 y DEC-008**, sin decidir nada nuevo.

### 4.3 La política contradice DEC-007 en una línea

`accounting-policy-DRAFT.md` §7:

> La devolución de un saldo a favor debe cancelar el pasivo y acreditar la cuenta financiera.

DEC-007 (aprobada): **v1 no procesa devoluciones de dinero.**

La contradicción está solo en la prosa. **Ninguna de las 31 reglas implementa esa devolución**, así que el JSON es correcto y el `.md` es el que sobra. La línea debe eliminarse o marcarse como fuera de alcance de v1, o alguien acabará implementándola por leer la política y no el contrato.

Ojo con no confundirla con `UNUSED_ADVANCE_RETURNED`, que es otra cosa y es legítima: un responsable de comisión devolviendo efectivo no gastado no es un reembolso a un peregrino.

### 4.4 El bloqueo multimoneda es más amplio de lo necesario

Las **31** reglas llevan `MULTICURRENCY_BLOCKED_UNTIL_APPROVED_DECISION`. Pero **DEC-009 está aprobada** y ya fija lo que casi todas necesitan: la tasa se congela al cargar la evidencia, el importe convertido se guarda y no se recalcula.

Lo que DEC-009 **no** resuelve, y sigue legítimamente bloqueado, es la moneda funcional de los libros y el tratamiento de la diferencia de cambio. Conviene separar ambas cosas: bloquear las 31 reglas por algo que solo afecta a unas pocas detiene trabajo que ya podría avanzar.

### 4.5 El plan de cuentas no está cerrado

| | Cantidad |
|---|---:|
| Roles declarados en la política | 20 |
| Roles usados en las reglas | 25 |
| **Usados pero no declarados** | **11** |
| **Declarados pero nunca usados** | **6** |

Usados sin declarar: `FINANCIAL_ACCOUNT_BY_CHANNEL`, `REVENUE_ROLE_BY_CONCEPT`, `EXPENSE_INVENTORY_OR_ASSET_BY_ITEM`, `EXPENSE_INVENTORY_OR_ASSET_BY_LINE`, `OPERATING_EXPENSE_BY_SERVICE`, `SOURCE_FINANCIAL_ACCOUNT`, `DESTINATION_FINANCIAL_ACCOUNT`, `FINANCIAL_OR_CLEARING_ACCOUNT`, `RECONCILIATION_DIFFERENCES_OR_DEFINED_COUNTERPART`, `INVERSE_OF_ORIGINAL_DEBITS`, `INVERSE_OF_ORIGINAL_CREDITS`.

Declarados sin usar: `CASH_ON_HAND`, `QR_CLEARING`, `OPERATING_EXPENSE`, `FIXED_ASSETS`, `PAYMENT_PROCESSING_FEES`, `RECONCILIATION_DIFFERENCES`.

**Hay dos clases de cosas mezcladas bajo el mismo nombre.** Unos son roles contables reales (`INVENTORY`, `ACCOUNTS_PAYABLE`); otros son *resolvedores*: `FINANCIAL_ACCOUNT_BY_CHANNEL` no es una cuenta, es «la cuenta que corresponda según el canal». El esquema los tipa a ambos como `string`, así que ningún validador puede distinguir un rol que debe existir en el plan de cuentas de un marcador que se resuelve en ejecución.

Peor: `RECONCILIATION_DIFFERENCES_OR_DEFINED_COUNTERPART` contiene un «o» dentro del identificador. Eso no es resoluble por máquina.

### 4.6 Cuatro operaciones sin regla

| Tema exigido por la instrucción | Estado |
|---|---|
| Sobrante de inventario | La política §9 lo nombra; **no hay regla** |
| Activos fijos comprados o donados | Solo por el meta-rol `..._BY_ITEM`; `FIXED_ASSETS` sin usar |
| Cierre financiero y periodo de ajuste | Solo prosa en §10; **no hay regla** |
| Comisión de pasarela | Rol declarado, **regla incompleta** (§4.1) |

### 4.7 Detalle menor de nomenclatura

La política §10 propone la llave `event_id + source_type + source_id + entry_kind + rule_version`. Las 31 reglas usan `... + version`. Mismo concepto, dos nombres. Conviene fijar uno antes de que se convierta en una columna.

## 5. La base de datos actual no soporta la propuesta

Verificado contra `prisma/schema.prisma` y la migración de P12:

| Necesita la propuesta | Estado actual | Falta |
|---|---|---|
| Rol contable por cuenta | `accounts_chart` tiene `code`, `name`, `kind` | **Columna `role`** o tabla de correspondencia rol→cuenta por gestión |
| `entry_kind` en el asiento | `journal_entries` tiene `source_entity`, `source_id` | **Columna `entry_kind`** |
| Versión de regla aplicada | No existe | **Columna `rule_version`** |
| Idempotencia garantizada | Índice **no único** sobre `(source_entity, source_id)` | **Índice único** sobre la llave completa |
| Reglas versionadas y consultables | No existen tablas | Tabla de reglas o carga desde `contracts/` |

La idempotencia es el punto delicado: hoy nada en la base impide contabilizar dos veces la misma fuente. Mientras sea solo una promesa del código, un reintento del worker puede duplicar un asiento. **Debe ser un índice único**, igual que se hizo con las camas en P06.

## 6. Conflicto de procedimiento que debe resolver el responsable

**El paquete prohíbe lo que usted me pidió hace un rato en esta misma sesión.**

- `01_INSTRUCCION_BLOQUEANTE`, Parte A, obligación 11: *«no reconstruyas los 120 requisitos por inferencia»*.
- La plantilla de migración lo repite: *«Los 120 requisitos no deben recrearse por inferencia desde el código o desde nombres de módulos»*.
- El `.docx` lo repite por tercera vez en §1.2.

Su instrucción anterior fue: *«genera esos 120 requisitos, muéstramelos y colócalos en un archivo para que yo los revise»*. Ya está hecho, en [`requirements-candidates-v26.md`](../01-product/requirements-candidates-v26.md).

Lo construí de la forma menos incompatible posible con lo que ahora pide el paquete:

- estado `CANDIDATE`, ningún requisito marcado canónico;
- no toca `requirements.json` ni `requirements.md` — el validador sigue contando 65;
- cada línea declara su procedencia y su confianza;
- está redactado como material de revisión, no como migración.

Aun así, **no es lo que la Parte A pide**, y no debe confundirse con la matriz de migración: son cosas distintas. Usted decide entre tres caminos:

1. **Conservarlo como borrador de apoyo** para leerlo y detectar ausencias, sin valor de migración. Es para lo que sirve.
2. **Archivarlo o eliminarlo** por incumplir la regla del paquete.
3. **Subir los siete documentos v2.6** y hacer la migración real requisito por requisito. Es el único camino que cierra la Parte A.

Los tres son legítimos. No lo decido yo.

## 7. Otro desajuste: el paquete asume menos decisiones de las que hay

La instrucción y la plantilla del informe hablan de **DEC-001 a DEC-005**. El repositorio tiene **DEC-001 a DEC-017, las diecisiete aprobadas**, y `decision-register.md` declara que no queda ninguna `BLOCKING`.

El paquete parece escrito contra una foto anterior al 5 de agosto, cuando se resolvieron DEC-005 a DEC-017. De ahí vienen los desajustes de §4.2 y §4.4: bloquea por decisiones que ya se tomaron.

**El siguiente identificador libre es `DEC-018`.** Ese es el número que le corresponde a `DEC-XXX-accounting-recognition-DRAFT.md` cuando se apruebe.

## 8. Archivos que se modificarían (si se aprueba)

Ninguno todavía. Cuando haya aprobación:

| Archivo | Cambio |
|---|---|
| `docs/01-product/accounting-policy.md` | Nuevo, desde el DRAFT corregido |
| `contracts/accounting-rules.json` | Nuevo, desde el DRAFT corregido |
| `contracts/accounting-rules.schema.json` | Nuevo, con la distinción rol/resolvedor |
| `docs/04-delivery/decisions/DEC-018.md` | Nuevo |
| `docs/04-delivery/decision-register.md` | Añadir DEC-018 |
| `prisma/schema.prisma` + migración | Rol en el plan de cuentas, `entry_kind`, `rule_version`, índice único |
| `packages/domain/src/accounting.ts` | Resolución de reglas, sin números de cuenta |
| `scripts/validate_canonical_docs.py` | Validar reglas contra su esquema |

## 9. Código que debe permanecer detenido

- Cualquier contabilización automática de pagos, compras, donaciones, inventarios y activos.
- La declaración de P12 como `Done`.
- La emisión de asientos desde el worker de P16 — hoy no lo hace y no debe empezar.

Los workers entregados en P16 (expiración de `HELD` y envío de correo) **no tocan contabilidad**. No están afectados por este bloqueo.

## 10. Pruebas y validadores que se agregarían

- Validación de `accounting-rules.json` contra el esquema, dentro del validador documental.
- Prueba de que **toda** regla con asiento cuadra, incluida la liquidación de pasarela con comisión (§4.1).
- Prueba de idempotencia: ejecutar la misma fuente dos veces produce un solo asiento, garantizado por el índice único.
- Prueba de reversión: revertir deja saldo neto cero y conserva el original.
- Prueba de que ningún número de cuenta aparece en el dominio.
- Prueba de que toda regla cita un rol declarado en el plan de cuentas.

## 11. Riesgos y reversión

| Riesgo | Mitigación |
|---|---|
| Aprobar la política con `GATEWAY_SETTLEMENT` como está | Corregir antes de aprobar; produce asientos descuadrados |
| Implementar la devolución de saldo de §7 | Contradice DEC-007; eliminar la línea de la política |
| Idempotencia solo en código | Índice único en base antes de contabilizar nada |
| Contabilizar antes de aprobar | El motor no genera asientos hoy; no activarlo |
| Asientos ya generados que haya que migrar | No hay ninguno: la tabla está vacía. **Ahora es el momento barato de cambiar el esquema** |

Reversión: mientras no se genere ningún asiento, revertir es borrar documentos y una migración. El coste sube en cuanto se contabilice la primera operación real.

## 12. Recomendación final

**Resultado:** `BLOCKED`

**Motivo:** la política y las reglas están bien construidas y son internamente consistentes, pero hay un defecto que produciría un asiento descuadrado (§4.1), una contradicción con una decisión aprobada (§4.3), un plan de cuentas incompleto (§4.5), cuatro operaciones sin regla (§4.6) y un esquema de base que todavía no puede sostener la propuesta (§5). Y la Parte A sigue sin fuente.

**Aprobaciones necesarias antes de implementar:**

1. Corregir `GATEWAY_SETTLEMENT` con la línea de comisión.
2. Eliminar de la política la devolución de saldo a favor, o declararla fuera de v1.
3. Cerrar el plan de cuentas: declarar los 11 roles faltantes y separar roles de resolvedores en el esquema.
4. Añadir reglas para sobrante de inventario, activos fijos y cierre financiero.
5. Levantar el bloqueo de sobrepagos citando DEC-007 y DEC-008.
6. Acotar el bloqueo multimoneda a lo que DEC-009 no resuelve.
7. Aprobar el DEC como **DEC-018**.
8. Decidir el destino del borrador de los 120 requisitos (§6).

**Lo más urgente no es contable: es que sin los documentos v2.6 la Parte A no puede completarse, y ese sigue siendo el motivo principal del no-go.**
