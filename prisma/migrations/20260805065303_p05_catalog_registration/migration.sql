-- CreateTable
CREATE TABLE "persons" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "full_name" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "document_number" TEXT,
    "country" CHAR(2),
    "phone" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_versions" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "payment_mode" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "min_payment_percent" INTEGER,
    "balance_due_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "person_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "price_version_id" UUID NOT NULL,
    "payment_mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "attendance_status" TEXT NOT NULL DEFAULT 'NOT_ARRIVED',
    "actual_arrival_at" TIMESTAMPTZ(6),
    "terms_accepted_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charges" (
    "id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "persons_user_id_key" ON "persons"("user_id");

-- CreateIndex
CREATE INDEX "packages_event_id_visibility_idx" ON "packages"("event_id", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "packages_event_id_code_key" ON "packages"("event_id", "code");

-- CreateIndex
CREATE INDEX "price_versions_package_id_payment_mode_idx" ON "price_versions"("package_id", "payment_mode");

-- CreateIndex
CREATE INDEX "registrations_event_id_status_idx" ON "registrations"("event_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_event_id_person_id_key" ON "registrations"("event_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_event_id_code_key" ON "registrations"("event_id", "code");

-- CreateIndex
CREATE INDEX "charges_registration_id_idx" ON "charges"("registration_id");

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_versions" ADD CONSTRAINT "price_versions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_price_version_id_fkey" FOREIGN KEY ("price_version_id") REFERENCES "price_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariantes de catalogo e inscripcion.
-- ---------------------------------------------------------------------------

-- PKG-002: visibilidad canonica.
ALTER TABLE "packages"
  ADD CONSTRAINT "packages_visibility_canonical"
  CHECK ("visibility" IN ('PUBLIC', 'PRIVATE'));

-- REG-001: exactamente dos modalidades, ni una mas.
ALTER TABLE "price_versions"
  ADD CONSTRAINT "price_versions_payment_mode_canonical"
  CHECK ("payment_mode" IN ('ADVANCE', 'ARRIVAL'));

ALTER TABLE "registrations"
  ADD CONSTRAINT "registrations_payment_mode_canonical"
  CHECK ("payment_mode" IN ('ADVANCE', 'ARRIVAL'));

-- requirements.md 10: los importes son decimales exactos y no negativos.
ALTER TABLE "price_versions"
  ADD CONSTRAINT "price_versions_amount_non_negative" CHECK ("amount" >= 0);

ALTER TABLE "charges"
  ADD CONSTRAINT "charges_amount_non_negative" CHECK ("amount" >= 0);

-- PKG-005: el minimo de pago es un porcentaje real.
ALTER TABLE "price_versions"
  ADD CONSTRAINT "price_versions_min_percent_range"
  CHECK ("min_payment_percent" IS NULL
         OR ("min_payment_percent" >= 0 AND "min_payment_percent" <= 100));

-- La vigencia de la tarifa anticipada debe ser un rango coherente.
ALTER TABLE "price_versions"
  ADD CONSTRAINT "price_versions_window_ordered"
  CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" >= "starts_at");

-- PKG-004: la tarifa anticipada necesita vigencia y minimo de pago; sin ellos
-- no se puede decidir si conserva tarifa (REG-004) ni si desbloquea hotel
-- (REG-003), y el dominio tendria que adivinar.
ALTER TABLE "price_versions"
  ADD CONSTRAINT "price_versions_advance_is_complete" CHECK (
    "payment_mode" <> 'ADVANCE'
    OR ("starts_at" IS NOT NULL AND "ends_at" IS NOT NULL AND "min_payment_percent" IS NOT NULL)
  );

-- Estados canonicos de inscripcion y asistencia (contracts/states.json).
ALTER TABLE "registrations"
  ADD CONSTRAINT "registrations_status_canonical"
  CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'CANCELLED'));

ALTER TABLE "registrations"
  ADD CONSTRAINT "registrations_attendance_canonical"
  CHECK ("attendance_status" IN ('NOT_ARRIVED', 'CHECKED_IN', 'NO_SHOW', 'COMPLETED'));

-- Una version de precio solo puede usarse en inscripciones de su propio
-- paquete. Sin esto, un error de codigo podria congelar un cargo con el precio
-- de otro paquete y el historico quedaria incoherente sin que nadie lo notara.
ALTER TABLE "price_versions" ADD CONSTRAINT "price_versions_package_unique"
  UNIQUE ("id", "package_id");

ALTER TABLE "registrations" ADD CONSTRAINT "registrations_price_matches_package"
  FOREIGN KEY ("price_version_id", "package_id")
  REFERENCES "price_versions" ("id", "package_id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- GOV-005: los cargos no se reescriben ni se borran. Igual que la auditoria,
-- se impone con trigger para que la regla no dependa del codigo que escribe.
CREATE OR REPLACE FUNCTION charges_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'charges es inmutable: % no esta permitido (GOV-005, REG-002)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER charges_no_update
  BEFORE UPDATE ON "charges"
  FOR EACH ROW EXECUTE FUNCTION charges_immutable();

CREATE TRIGGER charges_no_delete
  BEFORE DELETE ON "charges"
  FOR EACH ROW EXECUTE FUNCTION charges_immutable();
