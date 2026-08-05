# Sistema web ENCUENTRO — Arquitectura técnica maestra v2.7

## 0. Decisión arquitectónica

Monorepo `pnpm`, aplicación Next.js y worker Node separados, monolito modular y PostgreSQL como fuente autoritativa. No se crean microservicios en v1.

## 1. Línea base tecnológica

| Capa | Línea base | Regla |
|---|---|---|
| Runtime | Node.js LTS | Patch exacto en `.nvmrc`, engines y CI. |
| Web | Next.js App Router | Versión exacta validada con Context7 y documentación oficial. |
| Lenguaje | TypeScript strict | Sin `any`, `ts-ignore` ni casts injustificados. |
| Datos | PostgreSQL + Prisma | Migraciones incrementales y probadas. |
| Async | Redis + BullMQ | Redis no es fuente autoritativa. |
| UI | Tailwind + componentes propios/shadcn adaptado | Sin dependencia runtime del catálogo externo. |
| QA | Vitest + Playwright | Tests versionados. |
| Archivos | S3 compatible o almacenamiento privado equivalente | Checksum, URL firmada y lifecycle. |
| Correo | Nodemailer + SMTP global | Envío por worker e historial. |

## 2. Infraestructura productiva — DEC-001

- OVHcloud VPS-3.
- Ubuntu Server 24.04 LTS.
- Docker Engine y Docker Compose v2.
- `apps/web` y `apps/worker` en procesos/contenedores separados.
- PostgreSQL y Redis en red privada Docker o servicio gestionado; nunca expuestos a Internet.
- Reverse proxy Caddy o Nginx; solo 80/443 públicos y SSH restringido.
- Cloudflare opcional como DNS/CDN/WAF.
- Backups cifrados externos al VPS y ensayo de restauración.
- Despliegue cloud-first tras cada entrega aprobada.

## 3. Topología

```text
Internet -> Cloudflare -> Reverse proxy -> apps/web
apps/web -> PostgreSQL / Redis / Object Storage
apps/worker -> PostgreSQL / Redis / SMTP / exportaciones
Estaciones PWA -> /api/v1/offline/sync -> cola local IndexedDB
```

## 4. Estructura del repositorio

```text
/apps/web
/apps/worker
/packages/domain
/packages/application
/packages/infrastructure
/packages/ui
/packages/config
/prisma/migrations
/docs/01-product
/docs/02-architecture
/docs/03-design
/docs/04-delivery
/tests/e2e
/contracts
/scripts
```

Dependencias: `presentation -> application -> domain`; infraestructura implementa puertos. No hay queries Prisma en componentes React ni reglas sustantivas en Route Handlers.

## 5. Módulos y ownership

| Módulo | Ownership |
|---|---|
| Identity | cuenta y sesión |
| RBAC | permisos y scopes |
| Events | ciclo, duración, configuración, cierres |
| Registration | persona, participación, términos, llegada |
| Catalog | paquetes, visibilidad, precios y beneficios |
| Lodging | hoteles, inventario, holds, reservas y habitaciones |
| Billing | cargos, evidencias, pagos, asignaciones, reembolsos y comprobantes |
| Cash | cuentas, sesiones y movimientos |
| Credentials | holders, QR, estaciones y scans |
| Transport | llegadas, vehículos, horarios y traslados |
| Food | servicios diarios, pedidos, recepción, desperdicio y entrega |
| Materials | inventario, kits y entregas |
| Servers | voluntarios, turnos y beneficios |
| Accounting | asientos, tesorería, rendiciones, donaciones y activos |
| Notifications | SMTP, reglas, plantillas, jobs e historial |
| Reporting/Audit | reportes, exportaciones, métricas y auditoría |

## 6. Cambios integrados DEC-002 a DEC-004

### 6.1 Catálogo e inscripción

`price_versions` representa montos explícitos por modalidad. La inscripción conserva `price_version_id`, modalidad y cargo snapshot. `PRIVATE` no aparece públicamente y requiere `catalog.private.assign`.

### 6.2 Pagos manuales

No existe proveedor automático productivo. `payment_proofs` es el agregado de evidencia y revisión. Solo una aprobación transaccional crea/confirma `payments` y `payment_allocations`. La modalidad anticipada se habilita por reglas versionadas; el canal es un dato separado.

### 6.3 Comprobante

`receipts` se emite por pago, con secuencia transaccional por gestión, snapshot de contenido y token opaco de verificación. El endpoint público devuelve un subconjunto seguro. El PDF completo permanece privado.

### 6.4 Duración, hospedaje y servicios

`events.start_at/end_at` definen duración. `event_lodging_policies` define `night_count`, `check_in_date` y `check_out_date`. `actual_arrival_at` no reescribe reserva. `meal_services` define fecha, ventana y cantidades. Materiales no usa fecha de actividad como regla de exclusión.

## 7. Transacciones críticas

- Aprobar evidencia: lock de evidencia, validar duplicado y fecha, crear pago, asignar a cargo, emitir secuencia/recibo y outbox en una transacción.
- Seleccionar hotel: validar elegibilidad y disponibilidad; reservar atómicamente.
- Último cupo: constraint/lock para que solo una solicitud confirme.
- Entrega QR: idempotencia por estación/operation UUID y unique persona/servicio.
- Cierre: compare-and-swap por versión y snapshot de checklist.

## 8. Seguridad

Autorización en servidor por permiso y scope. Archivos privados, logs redactados, tokens por hash, protección CSRF, rate limit, cookies seguras, rotación de secretos y principio de mínimo privilegio.

## 9. Operación y observabilidad

Health checks separados para web/worker, correlation ID, métricas de latencia/errores/colas, alertas, Sentry, backups, restore test, runbooks y despliegue reversible.
