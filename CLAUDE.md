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
- DEC-001..017 están aprobadas. No queda ninguna `BLOCKING`.
- Autenticación: Better Auth (DEC-016). La autorización vive en el dominio, no en la librería.
- No se admiten menores de edad en v1 (DEC-006): es rechazo activo, no aviso.
- No hay devoluciones de dinero (DEC-007/008): cancelación y sobrepago dejan saldo a favor.
- La tasa de cambio se congela al cargar la evidencia (DEC-009).
- `HELD` expira a los 30 minutos; `CONFIRMED` nunca expira (DEC-005).
- Sin integración QR bancaria ni Google Sheets (DEC-015, DEC-017).
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
