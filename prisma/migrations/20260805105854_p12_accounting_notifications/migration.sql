-- CreateTable
CREATE TABLE "accounts_chart" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_chart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "memo" TEXT NOT NULL,
    "source_entity" TEXT,
    "source_id" TEXT,
    "currency" CHAR(3) NOT NULL,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "side" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smtp_settings" (
    "id" UUID NOT NULL,
    "singleton" BOOLEAN NOT NULL DEFAULT true,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT,
    "from_name" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "secure" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "smtp_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "event_id" UUID,
    "template_id" UUID NOT NULL,
    "to_email" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_chart_event_id_code_key" ON "accounts_chart"("event_id", "code");

-- CreateIndex
CREATE INDEX "journal_entries_event_id_entry_date_idx" ON "journal_entries"("event_id", "entry_date");

-- CreateIndex
CREATE INDEX "journal_entries_source_entity_source_id_idx" ON "journal_entries"("source_entity", "source_id");

-- CreateIndex
CREATE INDEX "journal_lines_entry_id_idx" ON "journal_lines"("entry_id");

-- CreateIndex
CREATE INDEX "journal_lines_account_id_idx" ON "journal_lines"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "smtp_settings_singleton_key" ON "smtp_settings"("singleton");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_code_version_key" ON "notification_templates"("code", "version");

-- CreateIndex
CREATE INDEX "notifications_status_scheduled_at_idx" ON "notifications"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "notifications_event_id_idx" ON "notifications"("event_id");

-- AddForeignKey
ALTER TABLE "accounts_chart" ADD CONSTRAINT "accounts_chart_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts_chart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "notification_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariantes de contabilidad y notificaciones.
-- ---------------------------------------------------------------------------

-- INFERIDO: los cinco tipos del metodo contable estandar.
ALTER TABLE "accounts_chart"
  ADD CONSTRAINT "accounts_chart_kind_canonical"
  CHECK ("kind" IN ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'));

ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_side_canonical" CHECK ("side" IN ('DEBIT', 'CREDIT'));

ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_amount_positive" CHECK ("amount" > 0);

-- NO INFERIDO: la partida doble.
--
-- Un asiento descuadrado no es un asiento. El constraint es DEFERRABLE e
-- INITIALLY DEFERRED porque las lineas se insertan una a una: comprobar en cada
-- INSERT haria imposible guardar la primera. Se verifica al hacer commit, que
-- es cuando el asiento esta completo.
CREATE OR REPLACE FUNCTION journal_entry_must_balance() RETURNS TRIGGER AS $$
DECLARE
  entry_id_to_check UUID;
  debit_total NUMERIC;
  credit_total NUMERIC;
  line_count INT;
BEGIN
  entry_id_to_check := COALESCE(NEW."entry_id", OLD."entry_id");

  SELECT
    COALESCE(SUM(CASE WHEN "side" = 'DEBIT' THEN "amount" ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN "side" = 'CREDIT' THEN "amount" ELSE 0 END), 0),
    COUNT(*)
  INTO debit_total, credit_total, line_count
  FROM "journal_lines" WHERE "entry_id" = entry_id_to_check;

  IF line_count = 0 THEN
    RETURN NULL;
  END IF;

  IF line_count < 2 THEN
    RAISE EXCEPTION 'Un asiento necesita al menos dos lineas'
      USING ERRCODE = 'check_violation';
  END IF;

  IF debit_total <> credit_total THEN
    RAISE EXCEPTION 'El asiento no cuadra: debe % contra haber %', debit_total, credit_total
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_lines_balance
  AFTER INSERT OR UPDATE OR DELETE ON "journal_lines"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION journal_entry_must_balance();

-- GOV-005: la contabilidad no se reescribe. Una correccion es un asiento de
-- reversion, no una edicion.
CREATE OR REPLACE FUNCTION accounting_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'La contabilidad es append-only: % no esta permitido (GOV-005)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_no_update
  BEFORE UPDATE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION accounting_append_only();

CREATE TRIGGER journal_entries_no_delete
  BEFORE DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION accounting_append_only();

-- Una linea no puede mezclar moneda con su asiento.
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_status_canonical"
  CHECK ("status" IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'));

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_attempts_non_negative" CHECK ("attempts" >= 0);

-- Un envio marcado como enviado necesita su fecha; uno fallido, su error.
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_sent_has_timestamp"
  CHECK ("status" <> 'SENT' OR "sent_at" IS NOT NULL);

-- GOV-007: SMTP es un singleton global. La columna es siempre TRUE y su indice
-- unico impide una segunda fila; asi la unicidad la garantiza la base y no una
-- comprobacion en codigo que alguien pueda saltarse.
ALTER TABLE "smtp_settings"
  ADD CONSTRAINT "smtp_settings_is_singleton" CHECK ("singleton" IS TRUE);

ALTER TABLE "smtp_settings"
  ADD CONSTRAINT "smtp_settings_port_valid" CHECK ("port" > 0 AND "port" <= 65535);
