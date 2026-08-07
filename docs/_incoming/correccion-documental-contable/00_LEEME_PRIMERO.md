# Paquete de corrección documental y contable para Claude Code

**Proyecto:** Sistema web ENCUENTRO  
**Estado:** borrador bloqueante para revisión y aprobación  
**Base documental:** v2.7 RC1, con referencia a la fuente v2.6

## Qué resuelve este paquete

Este paquete convierte en archivos entregables el diagnóstico actual:

- La v2.6 declaraba 185 requisitos.
- La v2.7 RC1 validó 65 requisitos.
- Quedan 120 requisitos por localizar, clasificar y migrar antes de declarar una versión canónica definitiva.
- El módulo contable puede validar asientos cuadrados, pero todavía no existe una política aprobada que determine qué asiento genera cada operación del sistema.

## Orden recomendado para entregarlo a Claude Code

1. Copia **todo el contenido de este paquete** en una carpeta temporal dentro del repositorio, por ejemplo `docs/_incoming/claude-correction-v2.7/`.
2. Abre Claude Code en la raíz del repositorio.
3. Pídele que lea primero `01_INSTRUCCION_BLOQUEANTE_CLAUDE_CODE.md`.
4. Claude debe usar los demás archivos como plantillas y propuestas; no debe reemplazar ciegamente la documentación existente.
5. Claude debe entregar primero el `READINESS_REPORT` y la matriz de migración.
6. No se debe activar la contabilización automática hasta que la política y la matriz de asientos sean aprobadas expresamente.

## Archivos incluidos

- `01_INSTRUCCION_BLOQUEANTE_CLAUDE_CODE.md`: instrucción exacta para ejecutar en el repositorio.
- `docs/01-product/accounting-policy-DRAFT.md`: política contable propuesta, todavía no aprobada.
- `contracts/accounting-rules.schema.json`: esquema para reglas contables versionadas.
- `contracts/accounting-rules.DRAFT.json`: conjunto inicial de reglas propuestas.
- `docs/04-delivery/decisions/DEC-XXX-accounting-recognition-DRAFT.md`: borrador de decisión; Claude debe asignar el siguiente DEC libre.
- `docs/04-delivery/requirement-migration-v2.6-to-current-TEMPLATE.md`: plantilla para clasificar los 185 requisitos.
- `READINESS_REPORT_TEMPLATE.md`: formato del informe que Claude debe entregar antes de implementar.
- `Politica_Contable_y_Migracion_Requisitos_v2.7_RC1.docx`: documento de revisión humana con todo el contenido consolidado.

## Restricción principal

Los archivos contables están marcados como `DRAFT` y `PROPOSED_NOT_APPROVED`. Son una propuesta de diseño, no una autorización para modificar el motor contable ni para generar asientos en producción.
