# Matriz de procedencia y consolidación — v2.7

## Estado de la nueva línea base

La v2.7 reúne las categorías documentales, contratos, configuración Claude, prototipo y decisiones DEC-001 a DEC-004 en un paquete autocontenido. Es una **línea base candidata para revisión**, no una copia binaria del ZIP v2.6 original.

| Fuente previa | Uso en v2.7 | Estado |
|---|---|---|
| Requisitos y reglas v2.6 | Base conceptual, glosario, estados, lifecycle y dominios | Consolidado de forma selectiva |
| Arquitectura maestra v2.6 | Monolito modular, worker, capas, 16 módulos y operación | Consolidado |
| Contratos de datos/API/RBAC v2.6 | Convenciones de datos, permisos, errores y endpoints | Consolidado de forma selectiva |
| Manual de identidad/UX v2.6 | Tipografía, tokens, responsive, rutas y componentes | Consolidado |
| Auditoría y plan v2.6 | Fases, gates, pruebas y go/no-go | Consolidado |
| Prompts Claude v2.6 | Gobierno P00–P20 | Actualizado a v2.7 |
| Arquitectura y parche DEC-004 locales | Duración, noches, alimentos y paquetes privados | Archivado e integrado |
| Decisiones de conversación DEC-001..004 | Reglas aprobadas posteriores | Integrado como fuente prevalente |

## Limitación de migración

El documento v2.6 declaraba 185 requisitos. El contrato `requirements.json` de esta reconstrucción contiene 65 requisitos directamente consolidados y afectados por DEC-001..004. Los requisitos v2.6 que no pudieron extraerse íntegramente del ZIP original no deben considerarse derogados. Antes de declarar v2.7 como reemplazo productivo definitivo, debe compararse contra los siete documentos v2.6 originales y migrar cualquier requisito no representado.

## Regla de uso

Hasta completar esa comparación, v2.7 sirve para revisión funcional de DEC-001..004 y como paquete técnico autocontenido, pero no autoriza eliminar o archivar las fuentes v2.6 originales.
