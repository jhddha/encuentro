-- CITEXT hace que el correo sea insensible a mayusculas sin indices funcionales.
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission")
);

-- CreateTable
CREATE TABLE "role_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" TEXT NOT NULL,
    "event_id" UUID,
    "commission_id" TEXT,
    "cash_account_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publicly_enabled" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "event_id" UUID,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "reason" TEXT,
    "before_redacted" JSONB,
    "after_redacted" JSONB,
    "correlation_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "role_assignments_user_id_idx" ON "role_assignments"("user_id");

-- CreateIndex
CREATE INDEX "role_assignments_event_id_idx" ON "role_assignments"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_code_key" ON "events"("code");

-- CreateIndex
CREATE UNIQUE INDEX "events_year_key" ON "events"("year");

-- CreateIndex
CREATE INDEX "audit_logs_event_id_created_at_idx" ON "audit_logs"("event_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariantes que Prisma no puede expresar en el esquema.
--
-- Todas viven aqui, en la base, y no en la capa de aplicacion: una regla que
-- solo existe en el codigo se rompe en cuanto alguien escribe por otra via
-- (una migracion de datos, psql, un script de soporte).
-- ---------------------------------------------------------------------------

-- EVT-002: las fechas de la gestion deben ser coherentes.
ALTER TABLE "events"
  ADD CONSTRAINT "events_dates_ordered" CHECK ("end_at" >= "start_at");

-- EVT-006: solo una gestion puede estar publicamente habilitada.
--
-- La columna es TRUE o NULL, nunca FALSE. Un indice unico trata cada NULL como
-- distinto, asi que admite muchas gestiones no publicadas y como maximo una
-- publicada. Con un booleano corriente haria falta un indice parcial aparte.
CREATE UNIQUE INDEX "events_single_public" ON "events"("publicly_enabled")
  WHERE "publicly_enabled" IS TRUE;

ALTER TABLE "events"
  ADD CONSTRAINT "events_publicly_enabled_never_false"
  CHECK ("publicly_enabled" IS NULL OR "publicly_enabled" IS TRUE);

-- requirements.md 10: los cuatro scopes de RBAC y sus columnas obligatorias.
--
-- Sin este CHECK seria posible guardar una asignacion de tipo CASH sin
-- cash_account_id, y `scopeCovers` la trataria como si no alcanzara nada,
-- fallando en silencio en vez de rechazar el dato.
ALTER TABLE "role_assignments"
  ADD CONSTRAINT "role_assignments_scope_shape" CHECK (
    ("scope_type" = 'GLOBAL'
      AND "event_id" IS NULL AND "commission_id" IS NULL AND "cash_account_id" IS NULL)
    OR ("scope_type" = 'EVENT'
      AND "event_id" IS NOT NULL AND "commission_id" IS NULL AND "cash_account_id" IS NULL)
    OR ("scope_type" = 'COMMISSION'
      AND "event_id" IS NOT NULL AND "commission_id" IS NOT NULL AND "cash_account_id" IS NULL)
    OR ("scope_type" = 'CASH'
      AND "event_id" IS NOT NULL AND "commission_id" IS NULL AND "cash_account_id" IS NOT NULL)
  );

-- Una persona no repite el mismo rol en el mismo ambito.
CREATE UNIQUE INDEX "role_assignments_unique_scope" ON "role_assignments"(
  "user_id", "role_id", "scope_type",
  COALESCE("event_id"::text, ''),
  COALESCE("commission_id", ''),
  COALESCE("cash_account_id", '')
);

-- Estados canonicos, contra contracts/states.json.
ALTER TABLE "events"
  ADD CONSTRAINT "events_status_canonical" CHECK ("status" IN (
    'DRAFT', 'READY', 'ACTIVE', 'IN_PROGRESS',
    'OPERATIONALLY_CLOSED', 'FINANCIALLY_CLOSED', 'ARCHIVED'
  ));

ALTER TABLE "role_assignments"
  ADD CONSTRAINT "role_assignments_scope_type_canonical"
  CHECK ("scope_type" IN ('GLOBAL', 'EVENT', 'COMMISSION', 'CASH'));

-- GOV-005 y GOV-009: la auditoria es append-only.
--
-- Se impone con un trigger y no revocando privilegios porque el trigger actua
-- igual sea cual sea el rol que se conecte, incluido el superusuario que usa
-- el entorno local.
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs es append-only: % no esta permitido (GOV-009)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
