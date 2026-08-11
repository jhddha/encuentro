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

## Limitación de migración — resuelta el 7 de agosto de 2026

**Este apartado describía el estado de julio y ya no es cierto.** Se conserva reescrito porque explica de dónde venía el desfase.

Decía: «el documento v2.6 declaraba 185 requisitos y el contrato contiene 65 directamente consolidados; los que no pudieron extraerse del ZIP original no deben considerarse derogados». Esa comparación estaba pendiente y **se hizo**: apareció el documento de v2.6 con sus 185 exactos, se cruzó con los 13 del parche canónico DEC-004, y los **198** resultantes quedaron clasificados uno a uno en [`requirement-migration-v2.6-to-current.md`](requirement-migration-v2.6-to-current.md). El contrato pasó de 65 a **163**; los 35 restantes están reemplazados, eliminados citando una decisión aprobada, conservados bajo otro identificador, o con alcance aplazado por decisión del responsable.

**Lo que sigue sin verificarse es la frase «los siete documentos v2.6 originales».** Es una afirmación suelta que nadie enumera en este archivo ni en ningún otro, así que no consta cuáles son esos siete ni que se hayan revisado todos. Quedó anotado como tal en `handoff.md` §4 y sigue igual.

## Regla de uso

Con la comparación hecha, v2.7 es la línea base vigente. Las fuentes v2.6 originales **siguen sin poder archivarse** mientras la enumeración de los siete documentos no se verifique.
