# CLAUDE.md — Sistema web ENCUENTRO v2.7

## Fuentes de verdad

1. `docs/01-product/requirements.md`
2. `docs/04-delivery/decision-register.md`
3. `docs/02-architecture/system-architecture.md`
4. `docs/02-architecture/data-api-rbac.md`
5. `docs/03-design/design-system.md`
6. `docs/04-delivery/execution-plan.md`
7. `contracts/`

## Reglas permanentes

- No inventes reglas, proveedores, estados, rutas, permisos o descuentos.
- DEC-001..004, DEC-013, DEC-014 y DEC-016 están aprobadas y deben aplicarse.
- DEC-005..012, DEC-015 y DEC-017 permanecen pendientes cuando afecten el alcance.
- Autenticación: Better Auth (DEC-016). La autorización vive en el dominio, no en la librería.
- v1 usa pagos manuales; no agregues checkout automático.
- Modalidad y canal de pago son conceptos distintos.
- No prorratees por llegada tardía.
- No liberes una reserva `CONFIRMED` por llegada tardía.
- No expongas PII en QR, logs, URLs ni respuestas públicas.
- No uses `float` para dinero.
- No hagas commit, push, deploy, publicación, migración productiva, refund real o comando destructivo sin autorización explícita.
- Antes de usar APIs/librerías, verifica la versión instalada con Context7 y documentación oficial.

## Protocolo

Antes de editar: emite `READINESS_REPORT`.  
Después: ejecuta pruebas/validador y emite `DELIVERY_REPORT` con archivos, migraciones, comandos, resultados, riesgos y pendientes.
