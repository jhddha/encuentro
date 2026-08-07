# Sistema web ENCUENTRO — paquete documental canónico v2.7

**Fecha de consolidación:** 22 de julio de 2026  
**Estado:** CANDIDATO CANÓNICO PARA REVISIÓN  
**Objetivo de reemplazo:** v2.6 y parches separados DEC-001..DEC-004, después de verificar la migración completa.

## Objeto

Este paquete reúne en una única versión sincronizada las fuentes humanas, contratos legibles por máquina, configuración para Claude Code, prompts, prototipo HTML y registro de decisiones del Sistema web ENCUENTRO.

La versión v2.7 incorpora expresamente:

- **DEC-001:** infraestructura productiva OVHcloud VPS-3 y despliegue cloud-first.
- **DEC-002:** pagos manuales en v1, dos modalidades comerciales y verificación humana.
- **DEC-003:** formato, numeración y verificación del Comprobante de pago.
- **DEC-004:** precio completo durante `IN_PROGRESS`, duración configurable, noches fijas, alimentación por día/horario y paquetes privados.

## Jerarquía de fuentes

1. `docs/01-product/requirements.md`
2. `docs/04-delivery/decision-register.md` y decisiones aprobadas
3. `docs/02-architecture/system-architecture.md`
4. `docs/02-architecture/data-api-rbac.md`
5. `docs/03-design/design-system.md`
6. `docs/04-delivery/execution-plan.md`
7. `contracts/`
8. `prototypes/` como referencia visual secundaria

Ante conflicto, una decisión `APPROVED` posterior prevalece sobre texto anterior. El silencio documental no autoriza al agente a inventar.

## Contenido

- Documentación fuente Markdown en `docs/`.
- Documentos Word consolidados en `generated-docx/`.
- Prompts P00–P20 en `prompts/`.
- Prototipo integral en `prototypes/`.
- Configuración Claude Code en `CLAUDE.md`, `.mcp.json` y `.claude/`.
- Contratos JSON/YAML en `contracts/`.
- Validador documental en `scripts/validate_canonical_docs.py`.

## Validación

```bash
python scripts/validate_canonical_docs.py
```

El validador comprueba estructura, versión, decisiones, rutas, permisos, estados y referencias mínimas entre contratos.

## Nota de reconstrucción

La estructura v2.7 fue consolidada a partir de la documentación canónica v2.6 disponible en la Biblioteca del proyecto, la arquitectura local y las decisiones aprobadas en conversación. No conserva maquetación ni texto literal de todas las versiones históricas; las reemplaza por una fuente autocontenida y coherente.

## Control de migración

Consulte `docs/04-delivery/requirement-migration-v2.6-to-current.md`. La línea base es de 198 requisitos: 185 de v2.6 más 13 del parche canónico DEC-004. Los 198 están clasificados y el contrato usa ya la numeración canónica de v2.6. Las fuentes v2.6 no deben archivarse.
