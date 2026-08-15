-- Modulo de servidores: inscripcion propia, asignacion con vigencia y cobro
-- configurable — SRV-001, SRV-004, SRV-014, SRV-017, SRV-018, DEC-020.
--
-- El servidor no compra un paquete ni elige modalidad: se apunta a una
-- comision, alguien lo aprueba, y solo entonces paga si la gestion cobra. Tabla
-- propia por decision de la organizacion, en vez de una fila de `registrations`
-- con un paquete «servidor».

CREATE TABLE "server_registrations" (
  "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id"         UUID NOT NULL,
  "code"             TEXT NOT NULL,
  "person_id"        UUID NOT NULL,
  "commission_id"    UUID NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'PENDING',
  "form_data"        JSONB NOT NULL DEFAULT '{}',
  "reviewed_by"      UUID,
  "reviewed_at"      TIMESTAMPTZ(6),
  "rejection_reason" TEXT,
  "version"          INTEGER NOT NULL DEFAULT 1,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "server_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "server_registrations_event_id_person_id_key"
  ON "server_registrations"("event_id", "person_id");
CREATE UNIQUE INDEX "server_registrations_event_id_code_key"
  ON "server_registrations"("event_id", "code");
CREATE INDEX "server_registrations_commission_id_status_idx"
  ON "server_registrations"("commission_id", "status");

ALTER TABLE "server_registrations"
  ADD CONSTRAINT "server_registrations_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "server_registrations"
  ADD CONSTRAINT "server_registrations_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "server_registrations"
  ADD CONSTRAINT "server_registrations_commission_id_fkey"
  FOREIGN KEY ("commission_id") REFERENCES "commissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "server_registrations"
  ADD CONSTRAINT "server_registrations_reviewed_by_fkey"
  FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SRV-014: los siete estados de `contracts/states.json`.
ALTER TABLE "server_registrations"
  ADD CONSTRAINT "server_registrations_status_canonical"
  CHECK ("status" IN (
    'PENDING',
    'REJECTED',
    'AWAITING_PAYMENT',
    'ACTIVE',
    'SUSPENDED',
    'WITHDRAWN',
    'COMPLETED'
  ));

-- SRV-013: un rechazo sin motivo deja a la persona sin saber que corregir, y un
-- motivo sobre una solicitud que no se rechazo confunde a quien la lea.
ALTER TABLE "server_registrations"
  ADD CONSTRAINT "server_registrations_rejection_has_reason"
  CHECK (
    ("status" = 'REJECTED' AND "rejection_reason" IS NOT NULL AND btrim("rejection_reason") <> '')
    OR ("status" <> 'REJECTED' AND "rejection_reason" IS NULL)
  );

-- ---------------------------------------------------------------------------
-- SRV-004: peregrino O servidor, nunca ambos.
--
-- No cabe en un CHECK porque mira otra tabla, y no basta comprobarlo en el
-- codigo: son dos caminos distintos —el peregrino se inscribe solo, al servidor
-- lo aprueba un coordinador— y ninguno ve al otro.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION person_registers_once_per_event() RETURNS TRIGGER AS $fn$
DECLARE
  otra TEXT;
  choca BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'registrations' THEN
    otra := 'de servidor';
    SELECT EXISTS (
      SELECT 1 FROM "server_registrations"
      WHERE "event_id" = NEW."event_id" AND "person_id" = NEW."person_id"
    ) INTO choca;
  ELSE
    otra := 'de peregrino';
    SELECT EXISTS (
      SELECT 1 FROM "registrations"
      WHERE "event_id" = NEW."event_id" AND "person_id" = NEW."person_id"
    ) INTO choca;
  END IF;

  IF choca THEN
    RAISE EXCEPTION
      'La persona ya tiene una inscripcion % en esta gestion: es peregrino o servidor, no ambos (SRV-004)',
      otra
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER registrations_person_registers_once
  BEFORE INSERT OR UPDATE OF "person_id", "event_id" ON "registrations"
  FOR EACH ROW EXECUTE FUNCTION person_registers_once_per_event();

CREATE TRIGGER server_registrations_person_registers_once
  BEFORE INSERT OR UPDATE OF "person_id", "event_id" ON "server_registrations"
  FOR EACH ROW EXECUTE FUNCTION person_registers_once_per_event();

-- ---------------------------------------------------------------------------
-- SRV-001: comision, funcion, horario y vigencia, sin reescribir el historico.
--
-- Cambiar la funcion de alguien no puede borrar lo que hizo antes: el historico
-- de quien sirvio en que es lo que una organizacion de voluntarios necesita
-- conservar entre gestiones. Por eso la asignacion es una fila con vigencia:
-- cambiarla cierra la actual y abre otra.
-- ---------------------------------------------------------------------------

CREATE TABLE "server_assignments" (
  "id"                     UUID NOT NULL DEFAULT gen_random_uuid(),
  "server_registration_id" UUID NOT NULL,
  "commission_id"          UUID NOT NULL,
  "role"                   TEXT NOT NULL,
  "schedule"               TEXT,
  "valid_from"             TIMESTAMPTZ(6) NOT NULL,
  "valid_until"            TIMESTAMPTZ(6),
  "created_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"             UUID NOT NULL,
  CONSTRAINT "server_assignments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "server_assignments"
  ADD CONSTRAINT "server_assignments_server_registration_id_fkey"
  FOREIGN KEY ("server_registration_id") REFERENCES "server_registrations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "server_assignments"
  ADD CONSTRAINT "server_assignments_commission_id_fkey"
  FOREIGN KEY ("commission_id") REFERENCES "commissions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "server_assignments"
  ADD CONSTRAINT "server_assignments_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "server_assignments_server_registration_id_idx"
  ON "server_assignments"("server_registration_id");
CREATE INDEX "server_assignments_commission_id_valid_until_idx"
  ON "server_assignments"("commission_id", "valid_until");

ALTER TABLE "server_assignments"
  ADD CONSTRAINT "server_assignments_dates_ordered"
  CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from");

ALTER TABLE "server_assignments"
  ADD CONSTRAINT "server_assignments_role_present"
  CHECK (btrim("role") <> '');

-- Una sola asignacion vigente por servidor. Sin esto, cerrar la anterior seria
-- disciplina del codigo y una omision dejaria a alguien con dos funciones
-- activas a la vez, que es la clase de dato que nadie mira hasta el evento.
CREATE UNIQUE INDEX "server_assignments_one_current"
  ON "server_assignments"("server_registration_id")
  WHERE "valid_until" IS NULL;

-- ---------------------------------------------------------------------------
-- SRV-017 y SRV-018: el cobro, uno por gestion.
--
-- **El importe es el interruptor: cero es gratuito.** No hay un booleano
-- aparte. Con `is_paid` junto a un `amount` nulable existe el estado «cobra,
-- sin monto» y hay que prohibirlo con una restriccion; con un solo campo ese
-- estado no se puede escribir.
-- ---------------------------------------------------------------------------

CREATE TABLE "server_payment_config" (
  "event_id"   UUID NOT NULL,
  "amount"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "currency"   CHAR(3) NOT NULL,
  "version"    INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "server_payment_config_pkey" PRIMARY KEY ("event_id")
);

ALTER TABLE "server_payment_config"
  ADD CONSTRAINT "server_payment_config_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "server_payment_config"
  ADD CONSTRAINT "server_payment_config_amount_not_negative"
  CHECK ("amount" >= 0);

-- ---------------------------------------------------------------------------
-- El circuito de pago admite los dos duenos — SRV-020, DEC-020.
--
-- «El pago de servidor pasa por el mismo camino»: mismo canal, misma evidencia,
-- misma revision y mismo comprobante numerado. El precio es que tres tablas
-- pasen a tener dos duenos posibles y **exactamente uno presente**, y eso lo
-- verifica un CHECK, no la disciplina de quien escriba el siguiente caso de uso.
-- ---------------------------------------------------------------------------

ALTER TABLE "charges" ALTER COLUMN "registration_id" DROP NOT NULL;
ALTER TABLE "charges" ADD COLUMN "server_registration_id" UUID;
ALTER TABLE "charges"
  ADD CONSTRAINT "charges_server_registration_id_fkey"
  FOREIGN KEY ("server_registration_id") REFERENCES "server_registrations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "charges_server_registration_id_idx" ON "charges"("server_registration_id");

ALTER TABLE "charges"
  ADD CONSTRAINT "charges_exactly_one_owner"
  CHECK (num_nonnulls("registration_id", "server_registration_id") = 1);

ALTER TABLE "payment_proofs" ALTER COLUMN "registration_id" DROP NOT NULL;
ALTER TABLE "payment_proofs" ADD COLUMN "server_registration_id" UUID;
ALTER TABLE "payment_proofs"
  ADD CONSTRAINT "payment_proofs_server_registration_id_fkey"
  FOREIGN KEY ("server_registration_id") REFERENCES "server_registrations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "payment_proofs_server_registration_id_idx"
  ON "payment_proofs"("server_registration_id");

ALTER TABLE "payment_proofs"
  ADD CONSTRAINT "payment_proofs_exactly_one_owner"
  CHECK (num_nonnulls("registration_id", "server_registration_id") = 1);

ALTER TABLE "payments" ADD COLUMN "server_registration_id" UUID;
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_server_registration_id_fkey"
  FOREIGN KEY ("server_registration_id") REFERENCES "server_registrations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "payments_server_registration_id_idx"
  ON "payments"("server_registration_id");

-- En `payments` es **como mucho** uno, no exactamente uno: la columna de
-- inscripcion ya era nulable, y un cobro en caja puede existir sin colgar de
-- ninguna. Lo que se prohibe es que cuelgue de las dos a la vez.
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_at_most_one_owner"
  CHECK (num_nonnulls("registration_id", "server_registration_id") <= 1);
