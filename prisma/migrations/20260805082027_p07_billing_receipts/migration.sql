-- CreateTable
CREATE TABLE "payment_channels" (
    "id" UUID NOT NULL,
    "event_id" UUID,
    "code" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'EVENT',
    "currency" CHAR(3) NOT NULL,
    "instructions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_proofs" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "declared_amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "reference" TEXT NOT NULL,
    "payer_name" TEXT,
    "file_id" TEXT,
    "file_checksum" TEXT,
    "exchange_rate_micros" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewed_by" UUID,
    "review_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "cash_account_code" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "opened_by" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "expected_amount" DECIMAL(12,2),
    "counted_amount" DECIMAL(12,2),
    "close_reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "registration_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCEEDED',
    "source_proof_id" UUID,
    "cash_session_id" UUID,
    "approved_by" UUID NOT NULL,
    "approved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "verification_token_hash" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(6),
    "voided_by" UUID,
    "void_reason" TEXT,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_channels_event_id_code_key" ON "payment_channels"("event_id", "code");

-- CreateIndex
CREATE INDEX "payment_proofs_event_id_status_idx" ON "payment_proofs"("event_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_proofs_event_id_reference_key" ON "payment_proofs"("event_id", "reference");

-- CreateIndex
CREATE INDEX "cash_sessions_event_id_status_idx" ON "cash_sessions"("event_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_source_proof_id_key" ON "payments"("source_proof_id");

-- CreateIndex
CREATE INDEX "payments_event_id_status_idx" ON "payments"("event_id", "status");

-- CreateIndex
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "payment_allocations_charge_id_idx" ON "payment_allocations"("charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_payment_id_key" ON "receipts"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_verification_token_hash_key" ON "receipts"("verification_token_hash");

-- CreateIndex
CREATE INDEX "receipts_event_id_issued_at_idx" ON "receipts"("event_id", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_event_id_sequence_key" ON "receipts"("event_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_event_id_number_key" ON "receipts"("event_id", "number");

-- AddForeignKey
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "payment_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_source_proof_id_fkey" FOREIGN KEY ("source_proof_id") REFERENCES "payment_proofs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariantes de facturacion.
-- ---------------------------------------------------------------------------

-- requirements.md 10: importes decimales y no negativos.
ALTER TABLE "payment_proofs"
  ADD CONSTRAINT "payment_proofs_amount_positive" CHECK ("declared_amount" > 0);
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_amount_positive" CHECK ("amount" > 0);

-- Estados canonicos (contracts/states.json).
ALTER TABLE "payment_proofs"
  ADD CONSTRAINT "payment_proofs_status_canonical" CHECK ("status" IN (
    'PENDING_UPLOAD', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED',
    'REJECTED', 'CORRECTION_REQUESTED', 'REPLACED', 'CANCELLED'
  ));

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_status_canonical" CHECK ("status" IN (
    'PENDING', 'SUCCEEDED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED'
  ));

-- PAY-026: una evidencia revisada registra quien, cuando y por que. Sin esto,
-- una aprobacion podria quedar sin responsable identificable.
ALTER TABLE "payment_proofs"
  ADD CONSTRAINT "payment_proofs_review_is_complete" CHECK (
    "status" NOT IN ('APPROVED', 'REJECTED', 'CORRECTION_REQUESTED')
    OR ("reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)
  );

-- PAY-026: rechazar o pedir correccion exige motivo. Aprobar no lo necesita.
ALTER TABLE "payment_proofs"
  ADD CONSTRAINT "payment_proofs_rejection_needs_reason" CHECK (
    "status" NOT IN ('REJECTED', 'CORRECTION_REQUESTED')
    OR ("review_reason" IS NOT NULL AND length(trim("review_reason")) > 0)
  );

-- PAY-011: un cobro presencial vive dentro de una sesion de caja.
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_cash_needs_session" CHECK (
    "method" NOT IN ('CASH', 'CASH_QR') OR "cash_session_id" IS NOT NULL
  );

-- PAY-012: al cerrar hay que declarar esperado y contado; si difieren, motivo.
ALTER TABLE "cash_sessions"
  ADD CONSTRAINT "cash_sessions_close_is_complete" CHECK (
    "status" <> 'CLOSED'
    OR ("closed_at" IS NOT NULL AND "closed_by" IS NOT NULL
        AND "expected_amount" IS NOT NULL AND "counted_amount" IS NOT NULL
        AND ("expected_amount" = "counted_amount"
             OR ("close_reason" IS NOT NULL AND length(trim("close_reason")) > 0)))
  );

ALTER TABLE "cash_sessions"
  ADD CONSTRAINT "cash_sessions_status_canonical"
  CHECK ("status" IN ('OPEN', 'CLOSED'));

-- PAY-033: anular exige motivo y responsable. Un comprobante anulado sin
-- explicacion no serviria para auditar nada.
ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_void_is_complete" CHECK (
    "voided_at" IS NULL
    OR ("voided_by" IS NOT NULL
        AND "void_reason" IS NOT NULL AND length(trim("void_reason")) > 0)
  );

ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_sequence_positive" CHECK ("sequence" >= 1);

-- PAY-014: el numero debe corresponder a la secuencia. Sin esto, un error de
-- formato produciria dos comprobantes con numeros distintos y misma secuencia.
ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_number_matches_sequence"
  CHECK ("number" LIKE 'REC-%-' || lpad("sequence"::text, 6, '0'));

-- PAY-033 y GOV-005: pagos, asignaciones y comprobantes son inmutables.
--
-- El unico cambio admitido en un comprobante es su anulacion, que rellena
-- voided_at, voided_by y void_reason. Todo lo demas queda congelado: el
-- historico financiero no se reescribe.
CREATE OR REPLACE FUNCTION payments_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'payments es inmutable: % no esta permitido (GOV-005)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_no_update
  BEFORE UPDATE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION payments_immutable();

CREATE TRIGGER payments_no_delete
  BEFORE DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION payments_immutable();

CREATE TRIGGER payment_allocations_no_update
  BEFORE UPDATE ON "payment_allocations"
  FOR EACH ROW EXECUTE FUNCTION payments_immutable();

CREATE TRIGGER payment_allocations_no_delete
  BEFORE DELETE ON "payment_allocations"
  FOR EACH ROW EXECUTE FUNCTION payments_immutable();

CREATE OR REPLACE FUNCTION receipts_only_void() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'receipts es inmutable: DELETE no esta permitido (PAY-033)'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."event_id" IS DISTINCT FROM OLD."event_id"
     OR NEW."payment_id" IS DISTINCT FROM OLD."payment_id"
     OR NEW."sequence" IS DISTINCT FROM OLD."sequence"
     OR NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."snapshot_json"::text IS DISTINCT FROM OLD."snapshot_json"::text
     OR NEW."verification_token_hash" IS DISTINCT FROM OLD."verification_token_hash"
     OR NEW."issued_at" IS DISTINCT FROM OLD."issued_at" THEN
    RAISE EXCEPTION 'Un comprobante emitido solo admite anulacion (PAY-033)'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD."voided_at" IS NOT NULL THEN
    RAISE EXCEPTION 'Un comprobante ya anulado no admite mas cambios (PAY-033)'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER receipts_only_void
  BEFORE UPDATE OR DELETE ON "receipts"
  FOR EACH ROW EXECUTE FUNCTION receipts_only_void();
