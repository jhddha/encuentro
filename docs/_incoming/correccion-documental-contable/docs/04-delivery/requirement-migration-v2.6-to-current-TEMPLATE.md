# Migración de requisitos v2.6 → versión actual

**Estado:** EN PROCESO  
**Fuente esperada:** catálogo completo de 185 requisitos de v2.6  
**Referencia actual:** 65 requisitos validados en v2.7 RC1

## Resumen cuantitativo

| Métrica | Cantidad |
|---|---:|
| Requisitos declarados en v2.6 | 185 |
| Requisitos validados en v2.7 RC1 | 65 |
| Diferencia inicial por investigar | 120 |
| Conservados | PENDIENTE |
| Modificados | PENDIENTE |
| Reemplazados | PENDIENTE |
| Pendientes de migración | PENDIENTE |
| Conflictos | PENDIENTE |
| Eliminados por decisión aprobada | PENDIENTE |
| Total clasificado | PENDIENTE |

## Reglas de clasificación

- `CONSERVADO`: mismo significado y criterio de aceptación.
- `MODIFICADO`: mantiene identidad, pero una decisión posterior cambió su comportamiento o aceptación.
- `REEMPLAZADO`: una decisión aprobada lo sustituye por otro requisito identificado.
- `PENDIENTE_DE_MIGRACION`: existe en v2.6 y aún no está representado correctamente.
- `CONFLICTO`: dos fuentes vigentes indican comportamientos incompatibles.
- `ELIMINADO_POR_DECISION_APROBADA`: existe evidencia explícita de eliminación; no basta que no aparezca en v2.7.

## Matriz de migración

Completar una fila por cada uno de los 185 IDs originales. No inventar IDs faltantes.

| ID v2.6 | Título original | Estado de migración | ID actual | Fuente v2.6 | DEC/regla posterior | Cambio resumido | Criterio de aceptación actual | Fase | Prompt | Evidencia/archivo | Acción requerida |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |

## Conflictos

| ID | Fuentes en conflicto | Descripción | Riesgo | Decisión requerida | Responsable |
|---|---|---|---|---|---|
| PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |

## Verificaciones obligatorias

- [ ] Se localizaron los 185 IDs originales.
- [ ] Cada ID tiene exactamente un estado de migración.
- [ ] Ningún ID fue renumerado sin decisión explícita.
- [ ] Los requisitos equivalentes no están duplicados.
- [ ] Cada requisito vigente tiene criterio de aceptación.
- [ ] Cada requisito vigente tiene fase y prompt.
- [ ] Cada requisito modificado o eliminado cita una decisión aprobada.
- [ ] `requirements.json` y `requirements.md` contienen el mismo conjunto de IDs.
- [ ] Los mapas de trazabilidad y fases no contienen IDs huérfanos.
- [ ] El validador exige el total canónico resultante.

## Nota de bloqueo

Si el catálogo fuente v2.6 no está disponible, registrar el faltante en `SOURCE_GAPS.md` y detener esta tarea. Los 120 requisitos no deben recrearse por inferencia desde el código o desde nombres de módulos.
