# Análisis del esquema — Sistema web ENCUENTRO v2.7

**Generado:** 14 de agosto de 2026
**Extraído de:** la base de datos en ejecución (`information_schema` y catálogos de Postgres), no del `schema.prisma`. Es deliberado: las migraciones añaden restricciones, índices parciales y disparadores que Prisma no declara, y son justamente los que sostienen las reglas de negocio.

**Cifras:** 45 tablas · 413 columnas · 133 índices · 76 claves foráneas · 64 restricciones `CHECK` · 27 disparadores.

> Este documento es una fotografía. Las fuentes de verdad son `docs/01-product/requirements.md`, `docs/04-delivery/decision-register.md` y `contracts/`; cuando algo aquí discrepe de ellas, mandan ellas.

---

## 6. Stack y versiones

Se pone primero porque condiciona la lectura de todo lo demás.

| Capa | Tecnología | Versión |
|---|---|---|
| Lenguaje | TypeScript | 5.9.3 |
| Ejecución | Node | 24.19.0 (fijado en `engines`) |
| Gestor de paquetes | pnpm | 11.15.1 (monorepo con workspaces) |
| Framework web | Next.js (App Router) | 16.3.0 |
| UI | React | 19.2.8 |
| Estilos | Tailwind CSS | 4.3.3 |
| ORM | Prisma | 7.9.1 |
| Adaptador de base | `@prisma/adapter-pg` | 7.9.1 |
| Motor de base | PostgreSQL | 17 (`postgres:17`) |
| Autenticación | Better Auth | 1.6.26 |
| Colas | BullMQ sobre ioredis | 6.0.7 / 6.0.0 |
| Cola/caché | Redis | 7 (`redis:7-alpine`) |
| Almacén de objetos | S3-compatible (`@aws-sdk/client-s3`) | 3.1106.0 · MinIO en local |
| Correo | Nodemailer | 9.0.4 |
| Registro | pino | 10.3.1 |
| Validación | zod | 4.4.3 |
| Pruebas | Vitest · Playwright | 4.1.10 · 1.62.1 |

**Prisma 7 exige un driver adapter explícito**: la cadena de conexión vive en `prisma.config.ts`, no en `schema.prisma`.

---

## 5. Estructura de carpetas y capas

El proyecto **no** usa el patrón controlador/servicio/repositorio. Usa **arquitectura por capas con dependencia unidireccional**, impuesta por reglas del repositorio (`.claude/rules/02-domain-boundaries.md`) y por el marcador `server-only`:

```
presentación  →  aplicación  →  dominio
                      ↑
              infraestructura (implementa los puertos)
```

```
├── apps/
│   ├── web/                      Next.js — presentación
│   │   └── src/
│   │       ├── app/              App Router: 35 rutas exactas (contracts/routes.json)
│   │       │                     · page.tsx      → componente de servidor, lee y renderiza
│   │       │                     · actions.ts    → server actions = «controladores»
│   │       │                     · layout.tsx    → guardián del árbol (autenticación)
│   │       │                     · *.tsx         → componentes de cliente ('use client')
│   │       ├── components/       shell, barra de cuenta, formularios de sesión y MFA
│   │       └── lib/              container.ts (inyección), session.ts (sesión + RBAC),
│   │                             auth.ts, actions.ts (traductor de errores), rate-limit.ts
│   └── worker/                   BullMQ: expiración de retenciones y envío de correo
│
├── packages/
│   ├── domain/                   Reglas puras. Sin E/S, sin Prisma, sin React.
│   ├── application/              Casos de uso + puertos (interfaces de repositorio)
│   ├── infrastructure/           Implementaciones: Prisma, S3, SMTP, Better Auth
│   ├── config/                   Entorno y prueba del contrato de rutas
│   └── ui/                       Componentes y tokens del sistema de diseño
│
├── prisma/                       schema.prisma, 19 migraciones, seed y plan de cuentas
├── contracts/                    Fuente de verdad ejecutable (ver abajo)
├── docs/                         Requisitos, decisiones (DEC-001..020), runbooks
├── tests/                        integration/ (Postgres real) y e2e/ (Playwright)
└── scripts/                      validador documental, respaldo, roles, SMTP
```

### Equivalencias con el patrón clásico

| Patrón clásico | Aquí | Ejemplo |
|---|---|---|
| Controlador | Server action | `app/admin/e/[eventCode]/comprobantes/actions.ts` |
| Servicio / caso de uso | `packages/application/src/*.ts` | `review-payment-proof.ts` |
| Repositorio (interfaz) | Puerto en `application` | `PaymentProofRepository` |
| Repositorio (implementación) | `packages/infrastructure/src/*-repository.ts` | `payment-proof-repository.ts` |
| Entidad / reglas | `packages/domain/src/*.ts` | `billing.ts`, `lodging.ts`, `rbac.ts` |
| Consulta de lectura | `*-views.ts` o `find*` en infraestructura | `account-statement.ts`, `lodging-views.ts` |

### Casos de uso existentes (`packages/application`)

`create-registration` · `confirm-registration` · `transition-event` · `submit-payment-proof` · `review-payment-proof` · `register-exchange-rate` · `reserve-lodging` (elegir hotel, asignar habitación) · `configure-lodging` (inventario y política) · `expire-held-reservations` (worker) · `dispatch-notifications` (worker)

### Módulos de dominio (`packages/domain`)

`accounting` · `benefits` · `billing` · `civil-date` · `eligibility` · `errors` · `event-duration` · `exchange-rate` · `lodging` · `money` · `notifications` · `pricing` · `rbac` · `receipt` · `registration` · `states`

### Los contratos mandan

`contracts/` no es documentación: lo valida `scripts/validate_canonical_docs.py` y lo comprueban las pruebas.

| Archivo | Qué fija | Quién lo comprueba |
|---|---|---|
| `requirements.json` | 182 requisitos vigentes | validador: cada uno con fase y prompt |
| `routes.json` | 35 rutas exactas | `packages/config/src/routes.test.ts`, en ambas direcciones |
| `permissions.json` | 56 permisos | validador y `rbac.ts` |
| `states.json` | 9 máquinas de estado | `packages/domain/src/states.test.ts` |
| `accounting-rules.json` | 22 roles contables y su matriz | validador |
| `decisions.json` | DEC-001..020 | validador |

---

## 3. Dónde vive la lógica de comisiones

**Es una tabla, no un enum ni una lista de constantes.**

### La tabla

`commissions(id, event_id, code, name, area, active, created_at, updated_at)`, con `UNIQUE(event_id, code)` e índice por `(event_id, area)`.

Lo que conviene notar es lo que **no** hay:

- **No hay enum de Postgres.** La misma razón que para los permisos: un enum obliga a migrar el esquema cada vez que la organización añade una comisión, y quien manda sobre eso es la organización, no el esquema.
- **No hay constante en código.** Ningún archivo de TypeScript enumera comisiones.
- **`area` es una columna de texto, no una tabla.** Deliberado, por [DEC-020](docs/04-delivery/decisions/DEC-020.md): un «encargado de área» **es** un coordinador de todas las comisiones de su área, y su alcance es la unión de las suyas. Así no hace falta ni un ámbito `AREA` en el RBAC ni un encargado guardado en ninguna parte.

### Los datos

`prisma/comisiones.json` — **42 comisiones en 7 áreas**, derivadas del plan contable real de la organización por `scripts/importar_plan_contable.py`. Las áreas son: Atención al peregrino, Alimentación, Comisiones de apoyo, Espiritualidad, Liturgia, Comunicación y Logística. Las siembra `prisma/seed.ts`.

### Quién referencia una comisión

| Tabla | Columna | Para qué |
|---|---|---|
| `role_assignments` | `commission_id` (nula) | Ámbito `COMMISSION` del RBAC |
| `journal_entries` | `commission_id` (nula) | Imputar un asiento a una comisión |
| `server_registrations` | `commission_id` | A qué comisión solicita el servidor |
| `server_assignments` | `commission_id` | En cuál sirve, con vigencia |
| `audit_logs` | `commission_id` (nula) | SRV-023: el encargado ve solo lo de sus comisiones |

### La autorización por comisión

En `packages/domain/src/rbac.ts`. `ScopeType` admite `GLOBAL | EVENT | COMMISSION | CASH`, y `scopeCovers` decide la contención:

```ts
case 'COMMISSION':
  return resource.type === 'COMMISSION' && resource.commissionId === scope.commissionId;
```

Lo importante es lo que impide: **un ámbito estrecho nunca alcanza hacia arriba ni hacia los lados**. Quien coordina una comisión no alcanza otra, ni la gestión, ni el dinero.

---

## 4. Cómo se relacionan pagos e inscripciones

**Tablas propias, nunca campos dentro de la inscripción.** El saldo no se guarda: se **deriva** (`PAY-002`), y no existe ninguna columna de saldo que alguien pueda escribir.

### La cadena

```
registrations ──┐
                ├──< charges ──< payment_allocations >── payments ──1:1── receipts
server_regs ────┘                                            ↑
                                                       payment_proofs
                                                    (evidencia que una persona
                                                     revisa y aprueba)
```

| Tabla | Papel |
|---|---|
| `charges` | Lo que se debe. Congela condiciones en `snapshot_json` (PAY-001). |
| `payment_proofs` | Evidencia bancaria cargada. **No confirma nada** (PAY-025). |
| `payments` | Dinero confirmado. Lo crea aprobar una evidencia o cobrar en caja. |
| `payment_allocations` | Reparto de un pago entre cargos. De aquí sale el saldo. |
| `receipts` | Comprobante numerado por pago aprobado (PAY-028). |

### Dos dueños posibles, exactamente uno presente

Desde [DEC-020](docs/04-delivery/decisions/DEC-020.md), el pago del servidor usa el mismo circuito que el del peregrino. El precio es que tres tablas admitan dos dueños, y lo verifica la base:

```sql
-- charges y payment_proofs
CHECK (num_nonnulls(registration_id, server_registration_id) = 1)

-- payments: como mucho uno. Su columna de inscripción ya era nulable, y un
-- cobro en caja puede no colgar de ninguna. Lo que se prohíbe es que cuelgue
-- de las dos a la vez.
CHECK (num_nonnulls(registration_id, server_registration_id) <= 1)
```

### El saldo se calcula

`computeBalance` en `packages/domain/src/billing.ts` suma cargos y asignaciones. Dos reglas gobiernan el resultado:

- **`PAY-020`, las dos mitades**: ni se asigna más de lo que entró, ni más de lo que un cargo debe. La segunda **agrupa por cargo** antes de comparar; sin eso, dos asignaciones de 210 a un cargo de 210 pasaban las dos.
- **`DEC-008`**: el excedente no se fuerza contra ningún cargo. Queda sin asignar y **eso** es el saldo a favor, recuperable comparando lo cobrado con lo repartido.

### Multimoneda

Declarado y contabilizado son **dos cifras distintas**. El declarado es lo que la persona transfirió, en la moneda del canal; el contabilizado es lo que la organización registra haber cobrado, en la moneda funcional (bolivianos). La conversión ocurre en un solo punto —`requireBookedAmount`, al aprobar— con la tasa congelada al cargar la evidencia (DEC-009).

### Garantías que impone la base, no el código

| Garantía | Mecanismo |
|---|---|
| Un comprobante bancario no se aprueba dos veces | `UNIQUE(event_id, reference)` sobre `payment_proofs`, con `citext` |
| La numeración no se duplica bajo concurrencia | `pg_advisory_xact_lock` por gestión + `UNIQUE(event_id, sequence)` |
| Un pago aprobado no se reescribe | disparador de inmutabilidad |
| Un cobro en efectivo exige sesión de caja | `payments_cash_needs_session` |
| Importes estrictamente positivos | `CHECK (amount > 0)` |
| Los asientos cuadran | disparador `journal_lines_balance` |

---

## 2. Modelos y relaciones

45 tablas. El grafo cuelga casi entero de `events`: **GOV-001** exige que todo registro transaccional pertenezca a una gestión.

### Por dominio

| Dominio | Tablas |
|---|---|
| Identidad y sesión | `users`, `sessions`, `accounts`, `verifications`, `two_factors`, `persons` |
| Autorización | `roles`, `role_permissions`, `role_assignments`, `commissions` |
| Gestión | `events`, `audit_logs`, `exchange_rates` |
| Catálogo e inscripción | `packages`, `price_versions`, `registrations` |
| Servidores | `server_registrations`, `server_assignments`, `server_payment_config` |
| Hospedaje | `event_lodging_policies`, `hotels`, `rooms`, `reservations` |
| Facturación | `charges`, `payment_channels`, `payment_proofs`, `payments`, `payment_allocations`, `receipts`, `cash_sessions` |
| Credenciales y QR | `credentials`, `stations` |
| Alimentos y materiales | `meal_services`, `meal_deliveries`, `inventory_items`, `inventory_movements`, `material_deliveries` |
| Transporte | `vehicles`, `trips` |
| Contabilidad | `accounts_chart`, `journal_entries`, `journal_lines` |
| Notificaciones | `smtp_settings`, `notification_templates`, `notifications` |

### Relaciones principales

```
events ──1:N── packages ──1:N── price_versions
events ──1:N── registrations ──N:1── persons ──0:1── users
events ──1:N── server_registrations ──N:1── commissions
                        └──1:N── server_assignments (con vigencia)
events ──1:N── hotels ──1:N── rooms
registrations ──1:N── reservations ──N:1── hotels, rooms
registrations ──1:N── charges ──1:N── payment_allocations ──N:1── payments
payment_proofs ──1:1── payments ──1:1── receipts
events ──1:N── accounts_chart ──1:N── journal_lines ──N:1── journal_entries
```

**Todas las claves foráneas son `ON DELETE RESTRICT`**, salvo las de sesión y credencial de Better Auth (`CASCADE`) y `role_permissions` (`CASCADE`). Es `GOV-009`: no hay borrado físico de pagos, comprobantes, asientos, cierres, entregas ni auditoría.

### Las reglas que la base impone por sí sola

Son las que no dependen de que nadie se acuerde:

| Regla | Requisito | Mecanismo |
|---|---|---|
| Una persona es peregrino **o** servidor, nunca ambos | SRV-004 | disparador en las **dos** tablas |
| Una sola gestión públicamente habilitada | EVT-006 | índice único parcial |
| Una persona no se inscribe dos veces | — | `UNIQUE(event_id, person_id)` |
| Una plaza, una persona | HOS-002 | índice único parcial sobre `(room_id, bed_index)` en reservas vivas |
| La plaza cabe en la habitación | HOS-002 | disparador contra `rooms.capacity` |
| Una reserva viva por inscripción | — | índice único parcial |
| `held_until` solo mientras `HELD` | DEC-005 | `CHECK` |
| Una asignación de servidor vigente a la vez | SRV-001 | índice único parcial sobre `valid_until IS NULL` |
| Un rechazo lleva motivo | SRV-013 | `CHECK` |
| La auditoría no se edita ni se borra | GOV-009 | disparadores + `REVOKE` |

---

## 1. Esquema completo

Lo que sigue está extraído de la base en ejecución: columnas con su tipo y valor por omisión, claves foráneas con su regla de borrado, índices (marcando únicos y parciales), restricciones `CHECK` y disparadores.

### `accounts`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `user_id` | uuid | no | — |
| `account_id` | text | no | — |
| `provider_id` | text | no | — |
| `access_token` | text | sí | — |
| `refresh_token` | text | sí | — |
| `access_token_expires_at` | timestamptz | sí | — |
| `refresh_token_expires_at` | timestamptz | sí | — |
| `scope` | text | sí | — |
| `id_token` | text | sí | — |
| `password` | text | sí | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |

**FK:** `user_id` → `users` (ON DELETE CASCADE)

**Índices**
- `accounts_pkey` **único** — `(id)`
- `accounts_provider_id_account_id_key` **único** — `(provider_id, account_id)`
- `accounts_user_id_idx`  — `(user_id)`

### `accounts_chart`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `code` | text | no | — |
| `name` | text | no | — |
| `kind` | text | no | — |
| `currency` | char(3) | no | — |
| `active` | boolean | no | `true` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `role` | text | sí | — |

**FK:** `event_id` → `events` (ON DELETE RESTRICT)

**Índices**
- `accounts_chart_event_id_code_key` **único** — `(event_id, code)`
- `accounts_chart_event_role_currency_key` **único parcial** — `(event_id, role, currency) WHERE (role IS NOT NULL)`
- `accounts_chart_pkey` **único** — `(id)`

**CHECK**
- `accounts_chart_kind_canonical` — `CHECK ((kind = ANY (ARRAY['ASSET'::text, 'LIABILITY'::text, 'EQUITY'::text, 'INCOME'::text, 'EXPENSE'::text])))`
- `accounts_chart_role_canonical` — `CHECK (((role IS NULL) OR (role = ANY (ARRAY['CASH_ON_HAND'::text, 'BANK_ACCOUNT'::text, 'QR_CLEARING'::text, 'PAYMENT_GATEWAY_CLEARING'::text, 'PILGRIM_OFFERING_DOMESTIC'::text, 'PILGRIM_OFFERING_INTERNATIONAL'::text, 'SERVER_REGISTRATION_REVENUE'::text, 'MONETARY_DONATION_REVENUE'::text, 'IN_KIND_DONATION_REVENUE'::text, 'PARTICIPANT_ADVANCES'::text, 'ACCOUNTS_PAYABLE'::text, 'STAFF_REIMBURSEMENTS_PAYABLE'::text, 'ADVANCES_TO_ACCOUNT_FOR'::text, 'INVENTORY'::text, 'FIXED_ASSETS'::text, 'OPERATING_EXPENSE'::text, 'FOOD_AND_MATERIALS_EXPENSE'::text, 'LOSS_AND_WASTE_EXPENSE'::text, 'PAYMENT_PROCESSING_FEES'::text, 'RECONCILIATION_DIFFERENCES'::text, 'INVENTORY_SURPLUS'::text]))))`

### `audit_logs`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | sí | — |
| `actor_id` | uuid | no | — |
| `action` | text | no | — |
| `entity` | text | no | — |
| `entity_id` | text | no | — |
| `reason` | text | sí | — |
| `before_redacted` | jsonb | sí | — |
| `after_redacted` | jsonb | sí | — |
| `correlation_id` | text | sí | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `commission_id` | uuid | sí | — |

**FK:** `actor_id` → `users` (ON DELETE RESTRICT) · `commission_id` → `commissions` (ON DELETE RESTRICT) · `event_id` → `events` (ON DELETE RESTRICT)

**Índices**
- `audit_logs_commission_id_created_at_idx`  — `(commission_id, created_at)`
- `audit_logs_entity_entity_id_idx`  — `(entity, entity_id)`
- `audit_logs_event_id_created_at_idx`  — `(event_id, created_at)`
- `audit_logs_pkey` **único** — `(id)`

**CHECK**
- `audit_logs_commission_needs_event` — `CHECK (((commission_id IS NULL) OR (event_id IS NOT NULL)))`

**Disparadores**
- `audit_logs_no_delete` — BEFORE DELETE
- `audit_logs_no_update` — BEFORE UPDATE

### `cash_sessions`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `cash_account_code` | text | no | — |
| `currency` | char(3) | no | — |
| `opened_by` | uuid | no | — |
| `opened_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `closed_by` | uuid | sí | — |
| `closed_at` | timestamptz | sí | — |
| `expected_amount` | decimal(12,2) | sí | — |
| `counted_amount` | decimal(12,2) | sí | — |
| `close_reason` | text | sí | — |
| `status` | text | no | `'OPEN'` |

**FK:** `event_id` → `events` (ON DELETE RESTRICT)

**Índices**
- `cash_sessions_event_id_status_idx`  — `(event_id, status)`
- `cash_sessions_pkey` **único** — `(id)`

**CHECK**
- `cash_sessions_close_is_complete` — `CHECK (((status <> 'CLOSED'::text) OR ((closed_at IS NOT NULL) AND (closed_by IS NOT NULL) AND (expected_amount IS NOT NULL) AND (counted_amount IS NOT NULL) AND ((expected_amount = counted_amount) OR ((close_reason IS NOT NULL) AND (length(TRIM(BOTH FROM close_reason)) > 0))))))`
- `cash_sessions_status_canonical` — `CHECK ((status = ANY (ARRAY['OPEN'::text, 'CLOSED'::text])))`

### `charges`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `registration_id` | uuid | sí | — |
| `concept` | text | no | — |
| `amount` | decimal(12,2) | no | — |
| `currency` | char(3) | no | — |
| `snapshot_json` | jsonb | no | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `server_registration_id` | uuid | sí | — |

**FK:** `registration_id` → `registrations` (ON DELETE RESTRICT) · `server_registration_id` → `server_registrations` (ON DELETE RESTRICT)

**Índices**
- `charges_pkey` **único** — `(id)`
- `charges_registration_id_idx`  — `(registration_id)`
- `charges_server_registration_id_idx`  — `(server_registration_id)`

**CHECK**
- `charges_amount_non_negative` — `CHECK ((amount >= (0)::numeric))`
- `charges_exactly_one_owner` — `CHECK ((num_nonnulls(registration_id, server_registration_id) = 1))`

**Disparadores**
- `charges_no_delete` — BEFORE DELETE
- `charges_no_update` — BEFORE UPDATE

### `commissions`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `code` | text | no | — |
| `name` | text | no | — |
| `area` | text | no | — |
| `active` | boolean | no | `true` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |

**FK:** `event_id` → `events` (ON DELETE RESTRICT)

**Índices**
- `commissions_event_id_area_idx`  — `(event_id, area)`
- `commissions_event_id_code_key` **único** — `(event_id, code)`
- `commissions_pkey` **único** — `(id)`

### `credentials`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `registration_id` | uuid | no | — |
| `code` | text | no | — |
| `token_hash` | text | no | — |
| `status` | text | no | `'ACTIVE'` |
| `issued_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `revoked_at` | timestamptz | sí | — |
| `revoked_by` | uuid | sí | — |
| `revoke_reason` | text | sí | — |

**FK:** `event_id` → `events` (ON DELETE RESTRICT) · `registration_id` → `registrations` (ON DELETE RESTRICT)

**Índices**
- `credentials_event_id_code_key` **único** — `(event_id, code)`
- `credentials_pkey` **único** — `(id)`
- `credentials_registration_id_key` **único** — `(registration_id)`
- `credentials_token_hash_key` **único** — `(token_hash)`

**CHECK**
- `credentials_revoke_is_complete` — `CHECK (((revoked_at IS NULL) OR ((revoked_by IS NOT NULL) AND (revoke_reason IS NOT NULL) AND (length(TRIM(BOTH FROM revoke_reason)) > 0))))`

### `event_lodging_policies`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `night_count` | integer | no | — |
| `check_in_date` | date | no | — |
| `check_out_date` | date | no | — |
| `version` | integer | no | `1` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |

**FK:** `event_id` → `events` (ON DELETE RESTRICT)

**Índices**
- `event_lodging_policies_event_id_key` **único** — `(event_id)`
- `event_lodging_policies_pkey` **único** — `(id)`

**CHECK**
- `lodging_policy_night_count_positive` — `CHECK ((night_count >= 1))`
- `lodging_policy_nights_match_dates` — `CHECK (((check_out_date - check_in_date) = night_count))`

### `events`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `code` | text | no | — |
| `year` | integer | no | — |
| `name` | text | no | — |
| `timezone` | text | no | — |
| `start_at` | timestamptz | no | — |
| `end_at` | timestamptz | no | — |
| `currency` | char(3) | no | — |
| `status` | text | no | `'DRAFT'` |
| `version` | integer | no | `1` |
| `publicly_enabled` | boolean | sí | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |

**Índices**
- `events_code_key` **único** — `(code)`
- `events_pkey` **único** — `(id)`
- `events_single_public` **único parcial** — `(publicly_enabled) WHERE (publicly_enabled IS TRUE)`
- `events_year_key` **único** — `(year)`

**CHECK**
- `events_dates_ordered` — `CHECK ((end_at >= start_at))`
- `events_publicly_enabled_never_false` — `CHECK (((publicly_enabled IS NULL) OR (publicly_enabled IS TRUE)))`
- `events_status_canonical` — `CHECK ((status = ANY (ARRAY['DRAFT'::text, 'READY'::text, 'ACTIVE'::text, 'IN_PROGRESS'::text, 'OPERATIONALLY_CLOSED'::text, 'FINANCIALLY_CLOSED'::text, 'ARCHIVED'::text])))`

### `exchange_rates`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `currency` | char(3) | no | — |
| `rate_micros` | bigint | no | — |
| `effective_on` | date | no | — |
| `actor_id` | uuid | no | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |

**FK:** `actor_id` → `users` (ON DELETE RESTRICT) · `event_id` → `events` (ON DELETE RESTRICT)

**Índices**
- `exchange_rates_event_currency_day_key` **único** — `(event_id, currency, effective_on)`
- `exchange_rates_event_effective_idx`  — `(event_id, effective_on DESC)`
- `exchange_rates_pkey` **único** — `(id)`

**CHECK**
- `exchange_rates_positive` — `CHECK ((rate_micros > 0))`

**Disparadores**
- `exchange_rates_currency_is_foreign` — BEFORE UPDATE/INSERT

### `hotels`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `code` | text | no | — |
| `name` | text | no | — |
| `address` | text | sí | — |
| `status` | text | no | `'ACTIVE'` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |

**FK:** `event_id` → `events` (ON DELETE RESTRICT)

**Índices**
- `hotels_event_id_code_key` **único** — `(event_id, code)`
- `hotels_pkey` **único** — `(id)`

### `inventory_items`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `code` | text | no | — |
| `name` | text | no | — |
| `status` | text | no | `'ACTIVE'` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |

**FK:** `event_id` → `events` (ON DELETE RESTRICT)

**Índices**
- `inventory_items_event_id_code_key` **único** — `(event_id, code)`
- `inventory_items_pkey` **único** — `(id)`

### `inventory_movements`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `item_id` | uuid | no | — |
| `kind` | text | no | — |
| `quantity` | integer | no | — |
| `reason` | text | sí | — |
| `actor_id` | uuid | no | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |

**FK:** `item_id` → `inventory_items` (ON DELETE RESTRICT)

**Índices**
- `inventory_movements_item_id_created_at_idx`  — `(item_id, created_at)`
- `inventory_movements_pkey` **único** — `(id)`

**CHECK**
- `inventory_movements_kind_canonical` — `CHECK ((kind = ANY (ARRAY['RECEIPT'::text, 'ISSUE'::text, 'ADJUSTMENT'::text, 'LOSS'::text, 'DELIVERY'::text])))`
- `inventory_movements_quantity_sign` — `CHECK ((((kind = 'ADJUSTMENT'::text) AND (quantity <> 0)) OR ((kind <> 'ADJUSTMENT'::text) AND (quantity > 0))))`

**Disparadores**
- `inventory_movements_no_delete` — BEFORE DELETE
- `inventory_movements_no_update` — BEFORE UPDATE

### `journal_entries`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `entry_date` | date | no | — |
| `memo` | text | no | — |
| `source_entity` | text | sí | — |
| `source_id` | text | sí | — |
| `currency` | char(3) | no | — |
| `actor_id` | uuid | no | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `entry_kind` | text | sí | — |
| `rule_version` | integer | sí | — |
| `commission_id` | uuid | sí | — |

**FK:** `commission_id` → `commissions` (ON DELETE RESTRICT) · `event_id` → `events` (ON DELETE RESTRICT)

**Índices**
- `journal_entries_commission_id_idx`  — `(commission_id)`
- `journal_entries_event_id_entry_date_idx`  — `(event_id, entry_date)`
- `journal_entries_idempotency` **único parcial** — `(event_id, source_entity, source_id, entry_kind) WHERE ((source_entity IS NOT NULL) AND (source_id IS NOT NULL) AND (entry_kind IS NOT NULL))`
- `journal_entries_pkey` **único** — `(id)`
- `journal_entries_source_entity_source_id_idx`  — `(source_entity, source_id)`

**CHECK**
- `journal_entries_entry_kind_canonical` — `CHECK (((entry_kind IS NULL) OR (entry_kind = ANY (ARRAY['ADVANCE_APPLICATION'::text, 'ADVANCE_CLEARING'::text, 'ADVANCE_RETURN'::text, 'ADVANCE_TO_ACCOUNT_FOR'::text, 'DONATION_IN_KIND'::text, 'DONATION_RECEIVED'::text, 'GATEWAY_SETTLEMENT'::text, 'INVENTORY_IN_ADJUSTMENT'::text, 'INVENTORY_LOSS'::text, 'INVENTORY_OUT'::text, 'PARTICIPANT_ADVANCE'::text, 'PAYABLE_SETTLEMENT'::text, 'PURCHASE'::text, 'PURCHASE_PAYABLE'::text, 'RECONCILIATION_ADJUSTMENT'::text, 'REVENUE_RECOGNITION'::text, 'REVENUE_REVERSAL_TO_ADVANCE'::text, 'REVERSAL'::text, 'STAFF_REIMBURSEMENT_ACCRUAL'::text, 'STAFF_REIMBURSEMENT_SETTLEMENT'::text, 'TRANSFER'::text]))))`

**Disparadores**
- `journal_entries_commission_same_event` — BEFORE INSERT
- `journal_entries_have_lines` — AFTER INSERT
- `journal_entries_no_delete` — BEFORE DELETE
- `journal_entries_no_update` — BEFORE UPDATE

### `journal_lines`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `entry_id` | uuid | no | — |
| `account_id` | uuid | no | — |
| `side` | text | no | — |
| `amount` | decimal(12,2) | no | — |
| `currency` | char(3) | no | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |

**FK:** `account_id` → `accounts_chart` (ON DELETE RESTRICT) · `entry_id` → `journal_entries` (ON DELETE RESTRICT)

**Índices**
- `journal_lines_account_id_idx`  — `(account_id)`
- `journal_lines_entry_id_idx`  — `(entry_id)`
- `journal_lines_pkey` **único** — `(id)`

**CHECK**
- `journal_lines_amount_positive` — `CHECK ((amount > (0)::numeric))`
- `journal_lines_side_canonical` — `CHECK ((side = ANY (ARRAY['DEBIT'::text, 'CREDIT'::text])))`

**Disparadores**
- `journal_lines_balance` — AFTER INSERT/DELETE/UPDATE
- `journal_lines_match_entry` — BEFORE INSERT
- `journal_lines_no_delete` — BEFORE DELETE
- `journal_lines_no_update` — BEFORE UPDATE

### `material_deliveries`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `item_id` | uuid | no | — |
| `registration_id` | uuid | no | — |
| `station_id` | uuid | no | — |
| `operation_uuid` | text | no | — |
| `quantity` | integer | no | `1` |
| `delivered_at` | timestamptz | no | `CURRENT_TIMESTAMP` |

**FK:** `item_id` → `inventory_items` (ON DELETE RESTRICT) · `registration_id` → `registrations` (ON DELETE RESTRICT) · `station_id` → `stations` (ON DELETE RESTRICT)

**Índices**
- `material_deliveries_item_id_registration_id_key` **único** — `(item_id, registration_id)`
- `material_deliveries_pkey` **único** — `(id)`
- `material_deliveries_station_id_operation_uuid_key` **único** — `(station_id, operation_uuid)`

**CHECK**
- `material_deliveries_quantity_positive` — `CHECK ((quantity > 0))`

**Disparadores**
- `material_deliveries_no_delete` — BEFORE DELETE
- `material_deliveries_no_update` — BEFORE UPDATE

### `meal_deliveries`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `service_id` | uuid | no | — |
| `registration_id` | uuid | no | — |
| `station_id` | uuid | no | — |
| `operation_uuid` | text | no | — |
| `delivered_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `overridden_by` | uuid | sí | — |
| `override_reason` | text | sí | — |

**FK:** `registration_id` → `registrations` (ON DELETE RESTRICT) · `service_id` → `meal_services` (ON DELETE RESTRICT) · `station_id` → `stations` (ON DELETE RESTRICT)

**Índices**
- `meal_deliveries_pkey` **único** — `(id)`
- `meal_deliveries_service_id_idx`  — `(service_id)`
- `meal_deliveries_service_id_registration_id_key` **único** — `(service_id, registration_id)`
- `meal_deliveries_station_id_operation_uuid_key` **único** — `(station_id, operation_uuid)`

**CHECK**
- `meal_deliveries_override_is_complete` — `CHECK ((((overridden_by IS NULL) AND (override_reason IS NULL)) OR ((overridden_by IS NOT NULL) AND (override_reason IS NOT NULL) AND (length(TRIM(BOTH FROM override_reason)) > 0))))`

**Disparadores**
- `meal_deliveries_no_delete` — BEFORE DELETE
- `meal_deliveries_no_update` — BEFORE UPDATE

### `meal_services`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `service_date` | date | no | — |
| `type` | text | no | — |
| `starts_at` | timestamptz | no | — |
| `ends_at` | timestamptz | no | — |
| `available_count` | integer | no | — |
| `ordered_count` | integer | no | `0` |
| `received_count` | integer | no | `0` |
| `wasted_count` | integer | no | `0` |
| `status` | text | no | `'ACTIVE'` |
| `version` | integer | no | `1` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |

**FK:** `event_id` → `events` (ON DELETE RESTRICT)

**Índices**
- `meal_services_event_id_service_date_idx`  — `(event_id, service_date)`
- `meal_services_event_id_service_date_type_key` **único** — `(event_id, service_date, type)`
- `meal_services_pkey` **único** — `(id)`

**CHECK**
- `meal_services_counts_non_negative` — `CHECK (((available_count >= 0) AND (ordered_count >= 0) AND (received_count >= 0) AND (wasted_count >= 0)))`
- `meal_services_window_ordered` — `CHECK ((ends_at > starts_at))`

### `notification_templates`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `code` | text | no | — |
| `version` | integer | no | `1` |
| `subject` | text | no | — |
| `body` | text | no | — |
| `active` | boolean | no | `true` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |

**Índices**
- `notification_templates_code_version_key` **único** — `(code, version)`
- `notification_templates_pkey` **único** — `(id)`

### `notifications`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | sí | — |
| `template_id` | uuid | no | — |
| `to_email` | text | no | — |
| `variables` | jsonb | no | — |
| `status` | text | no | `'PENDING'` |
| `attempts` | integer | no | `0` |
| `scheduled_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `sent_at` | timestamptz | sí | — |
| `last_error` | text | sí | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |

**FK:** `event_id` → `events` (ON DELETE RESTRICT) · `template_id` → `notification_templates` (ON DELETE RESTRICT)

**Índices**
- `notifications_event_id_idx`  — `(event_id)`
- `notifications_pkey` **único** — `(id)`
- `notifications_status_scheduled_at_idx`  — `(status, scheduled_at)`

**CHECK**
- `notifications_attempts_non_negative` — `CHECK ((attempts >= 0))`
- `notifications_sent_has_timestamp` — `CHECK (((status <> 'SENT'::text) OR (sent_at IS NOT NULL)))`
- `notifications_status_canonical` — `CHECK ((status = ANY (ARRAY['PENDING'::text, 'SENDING'::text, 'SENT'::text, 'FAILED'::text, 'CANCELLED'::text])))`

### `packages`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `code` | text | no | — |
| `name` | text | no | — |
| `visibility` | text | no | `'PUBLIC'` |
| `status` | text | no | `'ACTIVE'` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |

**FK:** `event_id` → `events` (ON DELETE RESTRICT)

**Índices**
- `packages_event_id_code_key` **único** — `(event_id, code)`
- `packages_event_id_visibility_idx`  — `(event_id, visibility)`
- `packages_pkey` **único** — `(id)`

**CHECK**
- `packages_visibility_canonical` — `CHECK ((visibility = ANY (ARRAY['PUBLIC'::text, 'PRIVATE'::text])))`

### `payment_allocations`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `payment_id` | uuid | no | — |
| `charge_id` | uuid | no | — |
| `amount` | decimal(12,2) | no | — |
| `currency` | char(3) | no | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |

**FK:** `charge_id` → `charges` (ON DELETE RESTRICT) · `payment_id` → `payments` (ON DELETE RESTRICT)

**Índices**
- `payment_allocations_charge_id_idx`  — `(charge_id)`
- `payment_allocations_payment_id_idx`  — `(payment_id)`
- `payment_allocations_pkey` **único** — `(id)`

**CHECK**
- `payment_allocations_amount_positive` — `CHECK ((amount > (0)::numeric))`

**Disparadores**
- `payment_allocations_no_delete` — BEFORE DELETE
- `payment_allocations_no_update` — BEFORE UPDATE

### `payment_channels`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | sí | — |
| `code` | text | no | — |
| `scope` | text | no | `'EVENT'` |
| `currency` | char(3) | no | — |
| `instructions` | text | sí | — |
| `active` | boolean | no | `true` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |

**Índices**
- `payment_channels_event_id_code_key` **único** — `(event_id, code)`
- `payment_channels_pkey` **único** — `(id)`

### `payment_proofs`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `registration_id` | uuid | sí | — |
| `channel_id` | uuid | no | — |
| `declared_amount` | decimal(12,2) | no | — |
| `currency` | char(3) | no | — |
| `paid_at` | timestamptz | no | — |
| `reference` | citext | no | — |
| `payer_name` | text | sí | — |
| `file_id` | text | sí | — |
| `file_checksum` | text | sí | — |
| `exchange_rate_micros` | bigint | sí | — |
| `status` | text | no | `'SUBMITTED'` |
| `submitted_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `reviewed_at` | timestamptz | sí | — |
| `reviewed_by` | uuid | sí | — |
| `review_reason` | text | sí | — |
| `version` | integer | no | `1` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |
| `server_registration_id` | uuid | sí | — |

**FK:** `channel_id` → `payment_channels` (ON DELETE RESTRICT) · `event_id` → `events` (ON DELETE RESTRICT) · `registration_id` → `registrations` (ON DELETE RESTRICT) · `server_registration_id` → `server_registrations` (ON DELETE RESTRICT)

**Índices**
- `payment_proofs_event_id_reference_key` **único** — `(event_id, reference)`
- `payment_proofs_event_id_status_idx`  — `(event_id, status)`
- `payment_proofs_pkey` **único** — `(id)`
- `payment_proofs_server_registration_id_idx`  — `(server_registration_id)`

**CHECK**
- `payment_proofs_amount_positive` — `CHECK ((declared_amount > (0)::numeric))`
- `payment_proofs_exactly_one_owner` — `CHECK ((num_nonnulls(registration_id, server_registration_id) = 1))`
- `payment_proofs_rejection_needs_reason` — `CHECK (((status <> ALL (ARRAY['REJECTED'::text, 'CORRECTION_REQUESTED'::text])) OR ((review_reason IS NOT NULL) AND (length(TRIM(BOTH FROM review_reason)) > 0))))`
- `payment_proofs_review_is_complete` — `CHECK (((status <> ALL (ARRAY['APPROVED'::text, 'REJECTED'::text, 'CORRECTION_REQUESTED'::text])) OR ((reviewed_at IS NOT NULL) AND (reviewed_by IS NOT NULL))))`
- `payment_proofs_status_canonical` — `CHECK ((status = ANY (ARRAY['PENDING_UPLOAD'::text, 'SUBMITTED'::text, 'UNDER_REVIEW'::text, 'APPROVED'::text, 'REJECTED'::text, 'CORRECTION_REQUESTED'::text, 'REPLACED'::text, 'CANCELLED'::text])))`

### `payments`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `registration_id` | uuid | sí | — |
| `amount` | decimal(12,2) | no | — |
| `currency` | char(3) | no | — |
| `method` | text | no | — |
| `status` | text | no | `'SUCCEEDED'` |
| `source_proof_id` | uuid | sí | — |
| `cash_session_id` | uuid | sí | — |
| `approved_by` | uuid | no | — |
| `approved_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `server_registration_id` | uuid | sí | — |

**FK:** `cash_session_id` → `cash_sessions` (ON DELETE RESTRICT) · `event_id` → `events` (ON DELETE RESTRICT) · `registration_id` → `registrations` (ON DELETE RESTRICT) · `server_registration_id` → `server_registrations` (ON DELETE RESTRICT) · `source_proof_id` → `payment_proofs` (ON DELETE RESTRICT)

**Índices**
- `payments_event_id_status_idx`  — `(event_id, status)`
- `payments_pkey` **único** — `(id)`
- `payments_server_registration_id_idx`  — `(server_registration_id)`
- `payments_source_proof_id_key` **único** — `(source_proof_id)`

**CHECK**
- `payments_amount_positive` — `CHECK ((amount > (0)::numeric))`
- `payments_at_most_one_owner` — `CHECK ((num_nonnulls(registration_id, server_registration_id) <= 1))`
- `payments_cash_needs_session` — `CHECK (((method <> ALL (ARRAY['CASH'::text, 'CASH_QR'::text])) OR (cash_session_id IS NOT NULL)))`
- `payments_status_canonical` — `CHECK ((status = ANY (ARRAY['PENDING'::text, 'SUCCEEDED'::text, 'CANCELLED'::text, 'PARTIALLY_REFUNDED'::text, 'REFUNDED'::text])))`

**Disparadores**
- `payments_no_delete` — BEFORE DELETE
- `payments_no_update` — BEFORE UPDATE

### `persons`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `user_id` | uuid | sí | — |
| `full_name` | text | no | — |
| `birth_date` | date | no | — |
| `document_number` | text | sí | — |
| `country` | char(2) | sí | — |
| `phone` | text | sí | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |

**FK:** `user_id` → `users` (ON DELETE RESTRICT)

**Índices**
- `persons_pkey` **único** — `(id)`
- `persons_user_id_key` **único** — `(user_id)`

### `price_versions`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `package_id` | uuid | no | — |
| `payment_mode` | text | no | — |
| `amount` | decimal(12,2) | no | — |
| `currency` | char(3) | no | — |
| `starts_at` | timestamptz | sí | — |
| `ends_at` | timestamptz | sí | — |
| `min_payment_percent` | integer | sí | — |
| `balance_due_at` | timestamptz | sí | — |
| `status` | text | no | `'ACTIVE'` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |

**FK:** `package_id` → `packages` (ON DELETE RESTRICT)

**Índices**
- `price_versions_package_id_payment_mode_idx`  — `(package_id, payment_mode)`
- `price_versions_package_unique` **único** — `(id, package_id)`
- `price_versions_pkey` **único** — `(id)`

**CHECK**
- `price_versions_advance_is_complete` — `CHECK (((payment_mode <> 'ADVANCE'::text) OR ((starts_at IS NOT NULL) AND (ends_at IS NOT NULL) AND (min_payment_percent IS NOT NULL))))`
- `price_versions_amount_non_negative` — `CHECK ((amount >= (0)::numeric))`
- `price_versions_min_percent_range` — `CHECK (((min_payment_percent IS NULL) OR ((min_payment_percent >= 0) AND (min_payment_percent <= 100))))`
- `price_versions_payment_mode_canonical` — `CHECK ((payment_mode = ANY (ARRAY['ADVANCE'::text, 'ARRIVAL'::text])))`
- `price_versions_window_ordered` — `CHECK (((starts_at IS NULL) OR (ends_at IS NULL) OR (ends_at >= starts_at)))`

### `receipts`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `payment_id` | uuid | no | — |
| `sequence` | integer | no | — |
| `number` | text | no | — |
| `snapshot_json` | jsonb | no | — |
| `verification_token_hash` | text | no | — |
| `issued_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `voided_at` | timestamptz | sí | — |
| `voided_by` | uuid | sí | — |
| `void_reason` | text | sí | — |

**FK:** `event_id` → `events` (ON DELETE RESTRICT) · `payment_id` → `payments` (ON DELETE RESTRICT)

**Índices**
- `receipts_event_id_issued_at_idx`  — `(event_id, issued_at)`
- `receipts_event_id_number_key` **único** — `(event_id, number)`
- `receipts_event_id_sequence_key` **único** — `(event_id, sequence)`
- `receipts_payment_id_key` **único** — `(payment_id)`
- `receipts_pkey` **único** — `(id)`
- `receipts_verification_token_hash_key` **único** — `(verification_token_hash)`

**CHECK**
- `receipts_number_matches_sequence` — `CHECK ((number ~~ ('REC-%-'::text || lpad((sequence)::text, 6, '0'::text))))`
- `receipts_sequence_positive` — `CHECK ((sequence >= 1))`
- `receipts_void_is_complete` — `CHECK (((voided_at IS NULL) OR ((voided_by IS NOT NULL) AND (void_reason IS NOT NULL) AND (length(TRIM(BOTH FROM void_reason)) > 0))))`

**Disparadores**
- `receipts_only_void` — BEFORE DELETE/UPDATE

### `registrations`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `code` | text | no | — |
| `person_id` | uuid | no | — |
| `package_id` | uuid | no | — |
| `price_version_id` | uuid | no | — |
| `payment_mode` | text | no | — |
| `status` | text | no | `'DRAFT'` |
| `attendance_status` | text | no | `'NOT_ARRIVED'` |
| `actual_arrival_at` | timestamptz | sí | — |
| `terms_accepted_at` | timestamptz | sí | — |
| `version` | integer | no | `1` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |

**FK:** `event_id` → `events` (ON DELETE RESTRICT) · `package_id` → `packages` (ON DELETE RESTRICT) · `package_id` → `price_versions` (ON DELETE RESTRICT) · `package_id` → `price_versions` (ON DELETE RESTRICT) · `person_id` → `persons` (ON DELETE RESTRICT) · `price_version_id` → `price_versions` (ON DELETE RESTRICT) · `price_version_id` → `price_versions` (ON DELETE RESTRICT)

**Índices**
- `registrations_event_id_code_key` **único** — `(event_id, code)`
- `registrations_event_id_person_id_key` **único** — `(event_id, person_id)`
- `registrations_event_id_status_idx`  — `(event_id, status)`
- `registrations_pkey` **único** — `(id)`

**CHECK**
- `registrations_attendance_canonical` — `CHECK ((attendance_status = ANY (ARRAY['NOT_ARRIVED'::text, 'CHECKED_IN'::text, 'NO_SHOW'::text, 'COMPLETED'::text])))`
- `registrations_payment_mode_canonical` — `CHECK ((payment_mode = ANY (ARRAY['ADVANCE'::text, 'ARRIVAL'::text])))`
- `registrations_status_canonical` — `CHECK ((status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'CONFIRMED'::text, 'CANCELLED'::text])))`

**Disparadores**
- `registrations_person_registers_once` — BEFORE UPDATE/INSERT

### `reservations`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `registration_id` | uuid | no | — |
| `hotel_id` | uuid | no | — |
| `room_id` | uuid | sí | — |
| `bed_index` | integer | sí | — |
| `check_in_date` | date | no | — |
| `check_out_date` | date | no | — |
| `night_count` | integer | no | — |
| `status` | text | no | `'HELD'` |
| `held_until` | timestamptz | sí | — |
| `version` | integer | no | `1` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |

**FK:** `event_id` → `events` (ON DELETE RESTRICT) · `hotel_id` → `hotels` (ON DELETE RESTRICT) · `registration_id` → `registrations` (ON DELETE RESTRICT) · `room_id` → `rooms` (ON DELETE RESTRICT)

**Índices**
- `reservations_event_id_status_idx`  — `(event_id, status)`
- `reservations_hotel_id_status_idx`  — `(hotel_id, status)`
- `reservations_one_live_per_registration` **único parcial** — `(registration_id) WHERE (status = ANY (ARRAY['HELD'::text, 'CONFIRMED'::text]))`
- `reservations_one_person_per_bed` **único parcial** — `(room_id, bed_index) WHERE (status = ANY (ARRAY['HELD'::text, 'CONFIRMED'::text]))`
- `reservations_pkey` **único** — `(id)`

**CHECK**
- `reservations_dates_ordered` — `CHECK ((check_out_date > check_in_date))`
- `reservations_held_until_only_when_held` — `CHECK ((((status = 'HELD'::text) AND (held_until IS NOT NULL)) OR ((status <> 'HELD'::text) AND (held_until IS NULL))))`
- `reservations_night_count_positive` — `CHECK ((night_count >= 1))`
- `reservations_status_canonical` — `CHECK ((status = ANY (ARRAY['HELD'::text, 'CONFIRMED'::text, 'RELEASED'::text, 'CANCELLED'::text, 'EXPIRED'::text])))`

**Disparadores**
- `reservations_bed_within_capacity` — BEFORE UPDATE/INSERT

### `role_assignments`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `user_id` | uuid | no | — |
| `role_id` | uuid | no | — |
| `scope_type` | text | no | — |
| `event_id` | uuid | sí | — |
| `commission_id` | uuid | sí | — |
| `cash_account_id` | text | sí | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |

**FK:** `commission_id` → `commissions` (ON DELETE RESTRICT) · `event_id` → `events` (ON DELETE RESTRICT) · `role_id` → `roles` (ON DELETE RESTRICT) · `user_id` → `users` (ON DELETE RESTRICT)

**Índices**
- `role_assignments_commission_id_idx`  — `(commission_id)`
- `role_assignments_event_id_idx`  — `(event_id)`
- `role_assignments_pkey` **único** — `(id)`
- `role_assignments_unique_scope` **único** — `(user_id, role_id, scope_type, COALESCE((event_id)::text, ''::text), COALESCE((commission_id)::text, ''::text), COALESCE(cash_account_id, ''::text))`
- `role_assignments_user_id_idx`  — `(user_id)`

**CHECK**
- `role_assignments_scope_shape` — `CHECK ((((scope_type = 'GLOBAL'::text) AND (event_id IS NULL) AND (commission_id IS NULL) AND (cash_account_id IS NULL)) OR ((scope_type = 'EVENT'::text) AND (event_id IS NOT NULL) AND (commission_id IS NULL) AND (cash_account_id IS NULL)) OR ((scope_type = 'COMMISSION'::text) AND (event_id IS NOT NULL) AND (commission_id IS NOT NULL) AND (cash_account_id IS NULL)) OR ((scope_type = 'CASH'::text) AND (event_id IS NOT NULL) AND (commission_id IS NULL) AND (cash_account_id IS NOT NULL))))`
- `role_assignments_scope_type_canonical` — `CHECK ((scope_type = ANY (ARRAY['GLOBAL'::text, 'EVENT'::text, 'COMMISSION'::text, 'CASH'::text])))`

### `role_permissions`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `role_id` | uuid | no | — |
| `permission` | text | no | — |

**FK:** `role_id` → `roles` (ON DELETE CASCADE)

**Índices**
- `role_permissions_pkey` **único** — `(role_id, permission)`

### `roles`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `code` | text | no | — |
| `name` | text | no | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |

**Índices**
- `roles_code_key` **único** — `(code)`
- `roles_pkey` **único** — `(id)`

### `rooms`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `hotel_id` | uuid | no | — |
| `code` | text | no | — |
| `capacity` | integer | no | — |
| `status` | text | no | `'ACTIVE'` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |

**FK:** `hotel_id` → `hotels` (ON DELETE RESTRICT)

**Índices**
- `rooms_hotel_id_code_key` **único** — `(hotel_id, code)`
- `rooms_pkey` **único** — `(id)`

**CHECK**
- `rooms_capacity_positive` — `CHECK ((capacity >= 1))`

### `server_assignments`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `server_registration_id` | uuid | no | — |
| `commission_id` | uuid | no | — |
| `role` | text | no | — |
| `schedule` | text | sí | — |
| `valid_from` | timestamptz | no | — |
| `valid_until` | timestamptz | sí | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `created_by` | uuid | no | — |

**FK:** `commission_id` → `commissions` (ON DELETE RESTRICT) · `created_by` → `users` (ON DELETE RESTRICT) · `server_registration_id` → `server_registrations` (ON DELETE RESTRICT)

**Índices**
- `server_assignments_commission_id_valid_until_idx`  — `(commission_id, valid_until)`
- `server_assignments_one_current` **único parcial** — `(server_registration_id) WHERE (valid_until IS NULL)`
- `server_assignments_pkey` **único** — `(id)`
- `server_assignments_server_registration_id_idx`  — `(server_registration_id)`

**CHECK**
- `server_assignments_dates_ordered` — `CHECK (((valid_until IS NULL) OR (valid_until > valid_from)))`
- `server_assignments_role_present` — `CHECK ((btrim(role) <> ''::text))`

### `server_payment_config`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `event_id` | uuid | no | — |
| `amount` | decimal(12,2) | no | `0` |
| `currency` | char(3) | no | — |
| `version` | integer | no | `1` |
| `updated_at` | timestamptz | no | — |

**FK:** `event_id` → `events` (ON DELETE RESTRICT)

**Índices**
- `server_payment_config_pkey` **único** — `(event_id)`

**CHECK**
- `server_payment_config_amount_not_negative` — `CHECK ((amount >= (0)::numeric))`

### `server_registrations`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |
| `event_id` | uuid | no | — |
| `code` | text | no | — |
| `person_id` | uuid | no | — |
| `commission_id` | uuid | no | — |
| `status` | text | no | `'PENDING'` |
| `form_data` | jsonb | no | `'{}'` |
| `reviewed_by` | uuid | sí | — |
| `reviewed_at` | timestamptz | sí | — |
| `rejection_reason` | text | sí | — |
| `version` | integer | no | `1` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |

**FK:** `commission_id` → `commissions` (ON DELETE RESTRICT) · `event_id` → `events` (ON DELETE RESTRICT) · `person_id` → `persons` (ON DELETE RESTRICT) · `reviewed_by` → `users` (ON DELETE RESTRICT)

**Índices**
- `server_registrations_commission_id_status_idx`  — `(commission_id, status)`
- `server_registrations_event_id_code_key` **único** — `(event_id, code)`
- `server_registrations_event_id_person_id_key` **único** — `(event_id, person_id)`
- `server_registrations_pkey` **único** — `(id)`

**CHECK**
- `server_registrations_rejection_has_reason` — `CHECK ((((status = 'REJECTED'::text) AND (rejection_reason IS NOT NULL) AND (btrim(rejection_reason) <> ''::text)) OR ((status <> 'REJECTED'::text) AND (rejection_reason IS NULL))))`
- `server_registrations_status_canonical` — `CHECK ((status = ANY (ARRAY['PENDING'::text, 'REJECTED'::text, 'AWAITING_PAYMENT'::text, 'ACTIVE'::text, 'SUSPENDED'::text, 'WITHDRAWN'::text, 'COMPLETED'::text])))`

**Disparadores**
- `server_registrations_person_registers_once` — BEFORE INSERT/UPDATE

### `sessions`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `user_id` | uuid | no | — |
| `token` | text | no | — |
| `expires_at` | timestamptz | no | — |
| `ip_address` | text | sí | — |
| `user_agent` | text | sí | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |

**FK:** `user_id` → `users` (ON DELETE CASCADE)

**Índices**
- `sessions_pkey` **único** — `(id)`
- `sessions_token_key` **único** — `(token)`
- `sessions_user_id_idx`  — `(user_id)`

### `smtp_settings`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `singleton` | boolean | no | `true` |
| `host` | text | no | — |
| `port` | integer | no | — |
| `username` | text | sí | — |
| `from_name` | text | no | — |
| `from_email` | text | no | — |
| `secure` | boolean | no | `true` |
| `updated_at` | timestamptz | no | — |

**Índices**
- `smtp_settings_pkey` **único** — `(id)`
- `smtp_settings_singleton_key` **único** — `(singleton)`

**CHECK**
- `smtp_settings_is_singleton` — `CHECK ((singleton IS TRUE))`
- `smtp_settings_port_valid` — `CHECK (((port > 0) AND (port <= 65535)))`

### `stations`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `code` | text | no | — |
| `name` | text | no | — |
| `kind` | text | no | `'GENERAL'` |
| `status` | text | no | `'ACTIVE'` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |

**FK:** `event_id` → `events` (ON DELETE RESTRICT)

**Índices**
- `stations_event_id_code_key` **único** — `(event_id, code)`
- `stations_pkey` **único** — `(id)`

### `trips`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `vehicle_id` | uuid | no | — |
| `origin` | text | no | — |
| `destination` | text | no | — |
| `departs_at` | timestamptz | no | — |
| `arrives_at` | timestamptz | no | — |
| `status` | text | no | `'SCHEDULED'` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |

**FK:** `vehicle_id` → `vehicles` (ON DELETE RESTRICT)

**Índices**
- `trips_no_vehicle_overlap` parcial — `(vehicle_id, tstzrange(departs_at, arrives_at)) WHERE (status <> 'CANCELLED'::text)`
- `trips_pkey` **único** — `(id)`
- `trips_vehicle_id_departs_at_idx`  — `(vehicle_id, departs_at)`

**CHECK**
- `trips_schedule_ordered` — `CHECK ((arrives_at > departs_at))`

### `two_factors`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `user_id` | uuid | no | — |
| `secret` | text | no | — |
| `backup_codes` | text | no | — |
| `verified` | boolean | no | `true` |
| `failed_verification_count` | integer | no | `0` |
| `locked_until` | timestamptz | sí | — |

**FK:** `user_id` → `users` (ON DELETE CASCADE)

**Índices**
- `two_factors_pkey` **único** — `(id)`
- `two_factors_user_id_idx`  — `(user_id)`

### `users`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `email` | citext | no | — |
| `display_name` | text | no | — |
| `status` | text | no | `'ACTIVE'` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |
| `email_verified` | boolean | no | `false` |
| `image` | text | sí | — |
| `two_factor_enabled` | boolean | no | `false` |

**Índices**
- `users_email_key` **único** — `(email)`
- `users_pkey` **único** — `(id)`

### `vehicles`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `event_id` | uuid | no | — |
| `code` | text | no | — |
| `plate` | text | sí | — |
| `capacity` | integer | no | — |
| `driver_name` | text | sí | — |
| `status` | text | no | `'ACTIVE'` |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |

**FK:** `event_id` → `events` (ON DELETE RESTRICT)

**Índices**
- `vehicles_event_id_code_key` **único** — `(event_id, code)`
- `vehicles_pkey` **único** — `(id)`

**CHECK**
- `vehicles_capacity_positive` — `CHECK ((capacity >= 1))`

### `verifications`

| Columna | Tipo | Nulo | Por omisión |
|---|---|---|---|
| `id` | uuid | no | — |
| `identifier` | text | no | — |
| `value` | text | no | — |
| `expires_at` | timestamptz | no | — |
| `created_at` | timestamptz | no | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamptz | no | — |

**Índices**
- `verifications_identifier_idx`  — `(identifier)`
- `verifications_pkey` **único** — `(id)`
