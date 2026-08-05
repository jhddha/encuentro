# Sistema web ENCUENTRO — Auditoría y plan de ejecución v2.7

## 1. Estado de consolidación

La v2.7 elimina la fragmentación entre v2.6 y parches posteriores. DEC-001 a DEC-004 están integradas en requisitos, arquitectura, contratos, diseño, prompts, decisiones y prototipo.

## 2. Definition of Ready

- Requisito y criterio identificados.
- Decisiones bloqueantes resueltas.
- Tabla/DTO/API/permiso/estado definidos.
- Migración y rollback evaluados.
- Pruebas y estados UI previstos.
- Validador documental en verde.

## 3. Definition of Done

- Alcance limitado.
- Lint, typecheck, unit, integración, E2E y build pertinentes en verde.
- Migración desde base vacía y fixture existente.
- Pruebas negativas de autorización.
- Idempotencia/concurrencia donde aplica.
- Auditoría, errores de dominio, a11y y responsive.
- Contratos, trazabilidad y documentación actualizados.
- `DELIVERY_REPORT` con evidencia real.
- Despliegue cloud-first aprobado y health checks verificados cuando corresponda.

## 4. Fases

| Fase | Alcance | Gate |
|---:|---|---|
| 0 | Gobierno, decisiones, ADR, contratos y baseline | validador documental |
| 1 | Monorepo, toolchain, CI, Docker local y Claude Code | install frozen + build |
| 2 | Tokens, shells, rutas y componentes | responsive/a11y smoke |
| 3 | Events, RBAC, auditoría y auth spike | transiciones + matriz |
| 4 | Personas, inscripciones, catálogo, modalidades y cargos | E2E anticipado/al llegar + IN_PROGRESS |
| 5 | Hospedaje, política de noches y cupos | último cupo + reserva confirmada no liberada |
| 6 | Evidencias, pagos manuales, cajas y comprobantes | revisión, parcial, secuencia y QR |
| 7 | Check-in, credencial y cierre operativo | llegada tardía sin repricing |
| 8 | QR/PWA offline | idempotencia multiestación |
| 9 | Transporte | capacidad/horarios |
| 10 | Alimentos, materiales y servidores | horario/cantidad/entrega única |
| 11 | Contabilidad, tesorería y rendiciones | cuadre/reversión/cierre |
| 12 | SMTP, notificaciones, reportes/exportaciones | singleton/colas/histórico |
| 13 | Hardening, carga, backup y DR | security review + restore |
| 14 | UAT, capacitación y release | go/no-go firmado |

## 5. Escenarios obligatorios añadidos

1. Tarifa anticipada válida y evidencia aprobada al 50%.
2. Evidencia cargada antes del corte y aprobada después.
3. Evidencia cargada después del corte: no conserva tarifa.
4. Saldo anticipado pagado al llegar sin repricing.
5. Pago al llegar usa precio normal y no reserva hotel.
6. Paquete privado invisible al peregrino y asignable por Inscripciones.
7. Día 1, 3 y último día en `IN_PROGRESS` mantienen precio completo.
8. Evento configurado con duración distinta de 8 días.
9. Política de hospedaje configurada con noches distintas de 7.
10. Reserva `CONFIRMED` permanece ante llegada tardía.
11. Comida fuera de fecha u horario se rechaza.
12. Dos aprobaciones concurrentes no duplican pago ni número de comprobante.
13. QR público no expone PII y refleja anulación.

## 6. Go/no-go

No-go si existe decisión necesaria sin resolver, seguridad crítica/alta, migración o restore no ensayados, pago/QR/cierre sin idempotencia, secretos visibles, base/Redis expuestos, pruebas de `IN_PROGRESS` fallidas o documentación/contratos divergentes.

## 7. Trazabilidad DEC

| Decisión | Dominios | Pruebas mínimas |
|---|---|---|
| DEC-001 | Infraestructura, CI/CD, backup, observabilidad | deploy, health, firewall, restore |
| DEC-002 | Catálogo, inscripción, pagos, caja, hospedaje | 50%, fecha, saldo, dos modalidades |
| DEC-003 | Pagos, comprobantes, QR, auditoría | secuencia, anulación, verificación pública |
| DEC-004 | Events, catálogo, hospedaje, alimentos, materiales | día 1/3/final, noches, horarios, privado |
