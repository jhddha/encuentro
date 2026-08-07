# P00 — Auditoría documental determinista v2.7

**Fecha:** 4 de agosto de 2026
**Alcance:** solo lectura sobre el paquete canónico v2.7.
**Gate:** `python scripts/validate_canonical_docs.py` → exit 0.
**Resultado:** `OK ENCUENTRO docs v2.7: 65 requirement IDs, 28 routes, 36 permissions`

Esta auditoría no implementa nada. Ningún requisito se considera implementado por existir en la documentación.

## 1. Entorno verificado

| Herramienta | Versión | Estado |
|---|---|---|
| git | 2.55.0.windows.3 | operativo |
| Python | 3.12.10 | operativo |
| Node.js | 24.19.0 (LTS) | operativo |
| pnpm | 11.15.1 | operativo |
| Docker CLI | 29.6.2 | instalado |
| Docker daemon | — | **no arrancado**; requiere reinicio de Windows y primer arranque de Docker Desktop |

## 2. Comprobaciones en verde

| # | Comprobación | Resultado |
|---|---|---|
| V-01 | `VERSION` = `2.7` y referenciada en todos los documentos obligatorios | OK |
| V-02 | DEC-001..004 con `status: APPROVED` en `contracts/decisions.json` | OK |
| V-03 | DEC-001..004 coinciden entre `decisions.json` y `decision-register.md` (título y fecha) | OK |
| V-04 | Archivos `docs/04-delivery/decisions/DEC-00{1..4}.md` presentes | OK |
| V-05 | 65 IDs de requisito, sin duplicados | OK |
| V-06 | Los 65 IDs coinciden **1:1** entre `contracts/requirements.json` y `docs/01-product/requirements.md` (0 huérfanos en ambos sentidos) | OK |
| V-07 | Ruta pública `/verificar/comprobante/[token]` presente en `routes.json` | OK |
| V-08 | Permisos críticos presentes: `catalog.private.assign`, `payment.proof.review`, `receipt.read_sensitive`, `receipt.void` | OK |
| V-09 | `IN_PROGRESS` presente en la máquina de estados de gestión | OK |
| V-10 | Frases canónicas presentes en requisitos: «no se prorratea», «50%», «Documento de control interno», «7 noches», «8 días», «Paquetes privados» | OK |
| V-11 | 5 de las 6 máquinas de estado de `requirements.md` §4 replicadas en `states.json` | parcial → ver H-01 |
| V-12 | Rutas de `routes.json` (28) consistentes con `design-system.md` §5 | OK |
| V-13 | Configuración Claude presente: 7 reglas, 6 agentes, 7 skills, 1 hook, `settings.json`, `.mcp.json` | OK |
| V-14 | `MANIFEST.sha256`: 79/80 archivos íntegros | parcial → ver H-08 |

Distribución de los 65 requisitos: `PAY` 15, `EVT` 10, `GOV` 10, `HOS` 8, `REG` 8, `PKG` 5, `FOOD` 4, `MAT` 3, `CASH` 2.

## 3. Hallazgos

### H-01 — `states.json` omite la máquina de estados `payment` — ALTA — **CERRADO 5-ago-2026**

> Cerrado. `payment` se añadió a `contracts/states.json` y se transcribió a
> `packages/domain/src/states.ts` como `PAYMENT_STATES`. El test de contrato
> detectó la divergencia automáticamente. Se conserva el texto original abajo.


`docs/01-product/requirements.md` §4.2 declara seis máquinas. `contracts/states.json` define cinco (`registration`, `paymentComputed`, `attendance`, `paymentProof`, `lodging`) más `event`. Falta:

```
payment: PENDING, SUCCEEDED, CANCELLED, PARTIALLY_REFUNDED, REFUNDED
```

No confundir con `paymentComputed` (`UNPAID`/`PARTIAL`/`PAID`/`OVERPAID`/`REFUNDED`), que es el estado **derivado** del saldo. La máquina faltante es la del registro `payments.status` descrito en `data-api-rbac.md` §2.

**Impacto:** bloquea P07 (PAY-022..015, PAY-011..002). Sin el contrato, la implementación tendría que inferir los estados del pago, lo que viola la regla `01-no-guessing`.

### H-02 — `phase-requirement-map.json` cubre 6 de 15 fases — ALTA

Mapea las fases 0, 3, 4, 5, 6 y 10. `execution-plan.md` §4 define 15 fases (0–14). Sin mapear: 1, 2, 7, 8, 9, 11, 12, 13, 14.

Además, **GOV-001..GOV-009 no están asignados a ninguna fase**. Solo GOV-010 aparece (fase 0). Los GOV son invariantes transversales, pero el mapa no lo expresa de ninguna forma, así que el gate de fase no puede verificarlos.

**Impacto:** las fases 7, 8, 9, 11, 12, 13 y 14 no tienen requisitos asociados y no pueden cerrar contra un criterio verificable.

### H-03 — `prompt-requirement-map.json` cubre 5 de 21 prompts — ALTA

Mapea P03, P05, P06, P07 y P11. Los prompts P00–P20 son 21. GOV-001..GOV-010 no están asignados a ningún prompt.

**Impacto:** mismo problema que H-02, aplicado al gobierno por prompt.

### H-04 — `openapi.yaml` cubre 5 de ~25 endpoints — ALTA

Declara únicamente:

- `POST /api/v1/registrations/{id}/payment-proofs`
- `POST /api/v1/payment-proofs/{id}/review`
- `GET /api/v1/public/receipts/verify/{token}`
- `/api/v1/events/{id}/lodging-policy`
- `/api/v1/events/{id}/meal-services`

`data-api-rbac.md` §3 enumera unos 25 endpoints (eventos, transiciones, catálogo, price-versions, inscripciones, check-in, cajas, asignaciones, reembolsos, recibos, anulación, hoteles, selección de hotel, asignación de habitación, entregas). Los presentes tampoco tienen `requestBody`, esquemas de error ni códigos de estado más allá del feliz.

**Impacto:** `contracts/` no es fuente autoritativa para la API. P02 y siguientes tendrían que derivar los contratos del Markdown, que no es verificable por máquina.

### H-05 — `events.timezone` no es un permiso — MEDIA

`contracts/permissions.json` lista 36 permisos. `data-api-rbac.md` §6 lista 35. El sobrante es `events.timezone`, que:

- rompe la convención `<dominio-singular>.<acción>` que siguen los otros 35 (`event.create`, `event.read`, …);
- nombra un **campo** de la tabla `events` (`data-api-rbac.md` §2), no una acción.

Parece un artefacto de la consolidación. Si la intención era un permiso para cambiar la zona horaria, debería llamarse `event.timezone.update` y aparecer en la tabla RBAC.

### H-06 — Seis módulos sin permisos definidos — MEDIA

`system-architecture.md` §5 define 16 módulos. `permissions.json` solo cubre 10. Sin ningún permiso:

| Módulo | Ruta admin existente |
|---|---|
| Transport | `/admin/e/[eventCode]/transporte` |
| Accounting | `/admin/e/[eventCode]/contabilidad` |
| Reporting | `/admin/e/[eventCode]/reportes` |
| Notifications | `/admin/configuracion/correo` |
| Credentials | `/scanner/e/[eventCode]/[stationCode]` |
| Servers | — |

Hay rutas administrativas sin permiso que las proteja. La regla `03-security-rbac` exige autorizar en servidor por permiso y scope.

**Impacto:** bloquea P09, P10, P12 y P13 en cuanto a RBAC.

### H-07 — `requirements.json` no contiene el texto de los requisitos — MEDIA

Cada entrada es solo `{"id": ..., "status": "CANONICAL"}`. El campo `source` apunta al Markdown. Consecuencia: el validador puede detectar que un ID desaparece, pero **no** que su regla o criterio cambió. La deriva entre `requirements.md` y el contrato es indetectable automáticamente.

### H-08 — `MANIFEST.sha256` desactualizado — BAJA — **CERRADO 5-ago-2026**

> Regenerado tras el arreglo de encoding y la incorporación de `payment` al
> contrato de estados.


79 de 80 archivos íntegros. Discrepa `scripts/validate_canonical_docs.py`, modificado en el commit `95c953b` para declarar `encoding='utf-8'` en las seis lecturas que lo omitían (el script fallaba con `UnicodeDecodeError` bajo cp1252 en Windows). Hay que regenerar la línea del manifiesto.

### H-09 — Archivos duplicados en la raíz — BAJA

Dos archivos existen por duplicado, byte a byte idénticos:

- `Encuentro_Prototipo_Integral_v2.7.html` ≡ `prototypes/Encuentro_Prototipo_Integral_v2.7.html`
- `Prompts_Claude_Code_IA_First_v2.7.md` ≡ `prompts/Prompts_Claude_Code_IA_First_v2.7.md`

`README.md` §"Contenido" declara como canónicas las copias en `prototypes/` y `prompts/`. Las de la raíz son residuo del empaquetado y pueden divergir.

### H-10 — `preflight.sh` no es portable a Windows — BAJA

`.claude/hooks/preflight.sh` usa `#!/usr/bin/env bash`, `set -euo pipefail` y `grep -E`. En este entorno funciona solo vía Git Bash, y la línea `python scripts/...` falla porque el PATH de Git Bash no incluye el Python recién instalado. No está declarado en `settings.json`, así que hoy no se ejecuta automáticamente.

### H-11 — 13 decisiones BLOCKING sin resolver — INFORMATIVO

DEC-005..DEC-017 siguen abiertas. Impacto por fase, según `execution-plan.md`:

| Decisión | Bloquea |
|---|---|
| DEC-005 | Expiración de `HELD` (HOS-003) → P06 |
| DEC-006 | Menores y consentimiento → P05 |
| DEC-007 / DEC-008 | Reembolsos y sobrepagos → P07, P12 |
| DEC-009 | Tipo de cambio → P07, P12 |
| DEC-010 | Tamaño de credencial/recibo → P08 |
| DEC-011 | Retención y anonimización → P13 |
| DEC-012 | RPO/RTO y backup → P14 |
| DEC-013 / DEC-014 | Verificación de email y MFA → P04 |
| DEC-015 | Cierre de alcance QR Bolivia → P07 |
| DEC-016 | Auth.js o alternativa → **P04, y P01 no debe implementar auth productiva** |
| DEC-017 | Google Sheets → P13 |

Según `GOV-010` y la regla `01-no-guessing`, ninguna puede resolverla el agente. Se detiene solo el alcance afectado.

### H-12 — Migración incompleta desde v2.6 — INFORMATIVO

Ya documentado en `SOURCE_GAPS.md` y `source-migration-matrix.md`: la v2.6 declaraba 185 requisitos; esta línea base consolida 65. Los 120 restantes **no están derogados**. La v2.7 es *candidato canónico para revisión*, no reemplazo definitivo, y las fuentes v2.6 no deben archivarse.

## 4. Veredicto

**Gate P00: PASA.** El validador devuelve 0 y la coherencia interna entre requisitos, decisiones, estados y rutas es sólida.

Sin embargo, los contratos legibles por máquina están **materialmente incompletos** frente a la documentación humana (H-01 a H-04). Como `contracts/` es la fuente que consumen las fases de implementación, avanzar a P01 sin cerrarlos empuja hacia la adivinación, que es justamente lo que prohíben `CLAUDE.md` y la regla `01-no-guessing`.

### Recomendación de secuencia

1. **Cerrar H-01** (máquina `payment`) — barato y desbloquea P07.
2. **Cerrar H-05 y H-06** (permisos) — define el RBAC completo antes de escribir código.
3. **Cerrar H-02 y H-03** (mapas de fase y prompt) — sin esto los gates no son verificables.
4. **H-04** (OpenAPI) puede completarse de forma incremental por fase, siempre que P02 no lo dé por hecho.
5. **H-08, H-09, H-10** son limpieza; pueden ir en un solo cambio.
6. **P01** (monorepo, toolchain, CI, Docker local) puede arrancar en paralelo a 1–3, ya que no depende de los contratos de dominio. Recordatorio de P01: **no implementar auth productiva mientras DEC-016 siga BLOCKING.**

Todos los puntos 1–5 modifican documentación canónica y contratos. Por `06-delivery-gates` requieren actualizar además trazabilidad y `MANIFEST.sha256`. Ninguno puede ejecutarse sin decisión humana explícita cuando implique inventar reglas de negocio: H-01, H-02, H-03 y H-04 son transcripción de documentación existente; **H-05 y H-06 requieren decisión** sobre qué permisos deben existir.
