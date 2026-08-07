# Nota de procedencia y límites

La versión 2.7 es una consolidación autocontenida y no una copia binaria del ZIP v2.6 original, porque ese ZIP y sus archivos internos independientes no estaban montados en el entorno de trabajo.

Se reconstruyó a partir de:

- documentos canónicos v2.6 disponibles para lectura en la Biblioteca del proyecto;
- la arquitectura y el parche DEC-004 disponibles localmente;
- las decisiones DEC-001 a DEC-004 aprobadas en conversación.

## Límite verificable

El documento de requisitos v2.6 se localizó el 7 de agosto de 2026 y contiene **185 requisitos**. Con los 13 del parche canónico DEC-004, la línea base es de **198**. La migración requisito por requisito está clasificada en [`requirement-migration-v2.6-to-current.md`](docs/04-delivery/requirement-migration-v2.6-to-current.md); el contrato se renumeró a la numeración canónica de v2.6.

Los documentos originales v2.6 deben conservarse hasta completar una migración requisito por requisito. La matriz se encuentra en `docs/04-delivery/source-migration-matrix.md`.
