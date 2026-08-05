# Prompts para Claude Code — Sistema web ENCUENTRO v2.7

## Preámbulo obligatorio

Lee `CLAUDE.md`, fuentes canónicas, decisiones, contratos y git diff. DEC-001..004 están aprobadas. No implementes checkout automático, prorrateo, liberación de reserva confirmada por llegada tardía ni exposición pública de PII. Usa Context7/documentación oficial para APIs técnicas. Ejecuta el validador antes y después.

## P00 — Auditoría documental determinista

Solo lectura. Comprueba versiones, decisiones, requisitos, rutas, permisos, estados, mapas y configuración Claude. Genera `docs/implementation/00-document-audit.md`. Gate: validador 0.

## P01 — Toolchain, monorepo y CI

Crea workspace, web, worker, paquetes, Docker local, CI, env schema y comandos. No implementes auth productiva si DEC-016 sigue pendiente. Gate: install frozen, lint, typecheck, unit, build y docs validate.

## P02 — Sistema visual, rutas y shells

Implementa tokens, shells y rutas exactas de `contracts/routes.json`. Incluye verificación pública de comprobante y pantallas de modalidad/configuración. Gate: responsive/a11y.

## P03 — Events, RBAC y auditoría

Implementa ciclo manual, duración configurable, selector de gestión, permisos/scopes y auditoría append-only. Gate: transiciones válidas/invalidas, concurrencia y aislamiento.

## P04 — Identidad y autenticación

Ejecuta spike de Auth.js; no selecciones alternativa sin ADR. Implementa cuenta, sesiones, recuperación y protección. Gate: IDOR, enumeración, cookies y revocación.

## P05 — Inscripción, catálogo, modalidades y cargos

Implementa paquetes `PUBLIC/PRIVATE`, versiones de precio anticipado/normal, modalidad separada del canal, cargo snapshot, 50% y fecha límite. Durante `IN_PROGRESS` no prorratees ni crees tarifa tardía. Gate: anticipado/al llegar, evidencia en borde de fecha, días 1/3/final y paquete privado.

## P06 — Hospedaje

Implementa política configurable de noches, hoteles, inventario, `HELD`/`CONFIRMED`, selección de hotel y asignación de habitación. No liberes `CONFIRMED` por llegada tardía. La expiración de `HELD` queda bloqueada por DEC-005. Gate: último cupo y llegada tardía.

## P07 — Evidencias, pagos manuales, caja y comprobantes

Implementa canales manuales, carga privada, revisión, duplicados, pagos, asignaciones, caja y Comprobante de pago. No agregues proveedor automático. Emite `REC-{EVENT_CODE}-{NNNNNN}`, QR público mínimo y detalle autenticado. Gate: parcial, concurrencia, anulación, no PII.

## P08 — Check-in, credenciales y cierre operativo

Implementa check-in sin repricing, credenciales y cierre. Gate: llegada tardía con cargo intacto y bloqueo post-cierre.

## P09 — QR/PWA offline

Implementa estación, lease, manifiesto, cola, sync e idempotencia. Gate: doble entrega multiestación y reloj no confiable.

## P10 — Transporte

Vehículos, choferes, horarios, asignaciones y QR. Gate: solapamientos/capacidad.

## P11 — Alimentos, materiales y servidores

Alimentos por día, ventana, cantidades y movimientos; materiales por inventario/beneficio sin restricción por actividad pasada. Gate: fuera de horario, entrega única y stock reconstruible.

## P12 — Contabilidad y tesorería

Partida doble simplificada, cuentas, conciliaciones, rendiciones, donaciones y activos. Sin presupuestos/centros de costo. Respeta DEC-008/009.

## P13 — SMTP, notificaciones y reportes

SMTP singleton global, plantillas versionadas, jobs, historial y reportes por gestión. Caída SMTP no revierte negocio.

## P14 — Hardening, carga, backup y DR

Configura OVH VPS-3, Docker, firewall, reverse proxy, secretos, monitoreo, backup externo y restore test. No expongas PostgreSQL/Redis. Gate: seguridad, carga y rollback.

## P15 — UAT, capacitación y release

Ejecuta UAT, piloto, runbooks, capacitación y go/no-go. Despliegue cloud-first solo con autorización.

## P16 — Cambio funcional

Analiza impacto en requisitos, decisiones, ADR, esquema, API, permisos, rutas, notificaciones, pruebas, prompts y versión. Primero actualiza documentación canónica; luego implementa.

## P17 — Bugfix trazable

Reproduce, vincula requisito/contrato, escribe prueba fallida, corrige mínimo y ejecuta regresión. No cambies negocio para hacer pasar la prueba.

## P18 — Resolver decisión

No implementes. Prepara dossier, espera aprobación humana y luego actualiza registro, ADR, requisitos, contratos, diseño, trazabilidad y pruebas.

## P19 — Auditoría de entrega

Compara con fuentes, decisiones, contratos y DoD. Prioriza adivinación, scopes, lifecycle, mutabilidad, idempotencia, RBAC, PII, offline y migraciones.

## P20 — Continuidad

Lee fuentes, decisiones, git, migraciones y pruebas. Resume fase real, evidencia, deuda, bloqueos y siguiente tarea Ready antes de editar.
