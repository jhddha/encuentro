-- Las comisiones pasan a ser una tabla.
--
-- Hasta hoy `role_assignments.commission_id` era **texto libre sin integridad
-- referencial**, y los propios requisitos lo tenían anotado como la razón por la
-- que las asignaciones de rol no se copian entre gestiones: «commissionId y
-- cashAccountId son códigos sin tabla propia, de modo que una asignación copiada
-- apuntaría a lo que ese código signifique en la gestión nueva».
--
-- Cinco requisitos dependen de que exista: EVT-002 (la gestión define sus
-- comisiones), SRV-001 (el servidor tiene comisión), TRN-008 (el coordinador
-- solo ve la suya), ACC-007 (todo egreso exige comisión) y ACC-014 (los
-- reportes filtran por ella).
--
-- Y una consecuencia que se ve en el plan de cuentas real: 124 de sus 226
-- cuentas llevan la comisión dentro del nombre —«fondos comis. hospedaje»,
-- «gastos comis. transporte»— porque su sistema contable no tiene esta
-- dimensión. Con ella, la cuenta puede volver a decir **qué** y la comisión
-- **quién**.

CREATE TABLE IF NOT EXISTS "commissions" (
  "id"         UUID         NOT NULL,
  "event_id"   UUID         NOT NULL,
  "code"       TEXT         NOT NULL,
  "name"       TEXT         NOT NULL,
  -- Agrupación que la organización ya usa: espiritualidad, atención al
  -- peregrino, alimentación, comunicación, logística, liturgia y apoyo.
  "area"       TEXT         NOT NULL,
  "active"     BOOLEAN      NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- Por gestión, como el resto del catálogo: una comisión que desaparece de una
-- edición a la siguiente no debe arrastrar permisos ni asientos.
CREATE UNIQUE INDEX IF NOT EXISTS "commissions_event_id_code_key" ON "commissions" ("event_id", "code");
CREATE INDEX IF NOT EXISTS "commissions_event_id_area_idx" ON "commissions" ("event_id", "area");

ALTER TABLE "commissions" DROP CONSTRAINT IF EXISTS "commissions_event_id_fkey";
ALTER TABLE "commissions"
  ADD CONSTRAINT "commissions_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- El alcance de comisión deja de ser una cadena suelta.
--
-- La columna era TEXT y pasa a UUID con clave foránea. Se convierte en vez de
-- recrearse para que una fila existente falle ruidosamente en vez de perderse:
-- hoy no hay ninguna asignación de este alcance, y si la hubiera, su código no
-- sería un UUID y la migración se detendría — que es lo correcto, porque nadie
-- puede adivinar a qué comisión se refería.
--
-- Hay que retirar antes dos cosas que se apoyan en el tipo viejo, y reponerlas
-- después. Sin esto la conversión falla con «COALESCE types uuid and text
-- cannot be matched», que no dice cuál de las dos la provoca:
--
--  - el CHECK de forma del alcance, que Postgres reevalúa al convertir;
--  - el índice único de unicidad del alcance, que usa
--    `COALESCE(commission_id, '')` para tratar el nulo como un valor más. Ese
--    literal vacío es texto y deja de casar en cuanto la columna es UUID.
--
-- El índice se repone con `COALESCE(commission_id::text, '')`: la unicidad se
-- sigue calculando sobre texto, que es lo que permite mezclar tres columnas de
-- tipos distintos en la misma clave.
--
-- Cada `ADD CONSTRAINT` va precedido de su `DROP ... IF EXISTS`, y los índices
-- y columnas llevan `IF NOT EXISTS`: la migración entera es reejecutable.
--
-- Los `IF EXISTS` no son adorno. Esta migración se detuvo a mitad dos veces
-- mientras se escribía —una por el CHECK y otra por el índice— y sin ellos cada
-- reintento fallaba por un motivo distinto al original, que es la peor forma de
-- depurar una migración.
ALTER TABLE "role_assignments" DROP CONSTRAINT IF EXISTS "role_assignments_scope_shape";
DROP INDEX IF EXISTS "role_assignments_unique_scope";

ALTER TABLE "role_assignments"
  ALTER COLUMN "commission_id" TYPE UUID USING "commission_id"::UUID;

CREATE UNIQUE INDEX "role_assignments_unique_scope" ON "role_assignments" (
  "user_id",
  "role_id",
  "scope_type",
  COALESCE("event_id"::TEXT, ''),
  COALESCE("commission_id"::TEXT, ''),
  COALESCE("cash_account_id", '')
);

ALTER TABLE "role_assignments"
  ADD CONSTRAINT "role_assignments_scope_shape" CHECK (
    (scope_type = 'GLOBAL'     AND event_id IS NULL     AND commission_id IS NULL     AND cash_account_id IS NULL)
    OR (scope_type = 'EVENT'      AND event_id IS NOT NULL AND commission_id IS NULL     AND cash_account_id IS NULL)
    OR (scope_type = 'COMMISSION' AND event_id IS NOT NULL AND commission_id IS NOT NULL AND cash_account_id IS NULL)
    OR (scope_type = 'CASH'       AND event_id IS NOT NULL AND commission_id IS NULL     AND cash_account_id IS NOT NULL)
  );

ALTER TABLE "role_assignments" DROP CONSTRAINT IF EXISTS "role_assignments_commission_id_fkey";
ALTER TABLE "role_assignments"
  ADD CONSTRAINT "role_assignments_commission_id_fkey"
  FOREIGN KEY ("commission_id") REFERENCES "commissions" ("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "role_assignments_commission_id_idx" ON "role_assignments" ("commission_id");

-- ---------------------------------------------------------------------------
-- La dimensión en el asiento contable — ACC-007 y ACC-014.
--
-- Nula a propósito: no todo asiento pertenece a una comisión. Un cobro de
-- inscripción es de la gestión, no de nadie en particular; un gasto sí tiene
-- responsable, y ACC-007 lo exige.
--
-- No sustituye a la cuenta: la cuenta dice **qué** y la comisión **quién**.
-- Cuando el plan de cuentas ya distingue por comisión, las dos coinciden y se
-- refuerzan; cuando el gasto va contra una cuenta genérica, la dimensión aporta
-- lo que la cuenta no sabe.
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "commission_id" UUID;

ALTER TABLE "journal_entries" DROP CONSTRAINT IF EXISTS "journal_entries_commission_id_fkey";
ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_commission_id_fkey"
  FOREIGN KEY ("commission_id") REFERENCES "commissions" ("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "journal_entries_commission_id_idx" ON "journal_entries" ("commission_id");

-- Una comisión de otra gestión en un asiento sería la misma fuga que la cuenta
-- de otro plan (EVT-008). El disparador de líneas ya lo impide para las
-- cuentas; esto lo impide para la comisión.
CREATE OR REPLACE FUNCTION journal_entry_commission_same_event() RETURNS TRIGGER AS $$
DECLARE
  gestion_comision UUID;
BEGIN
  IF NEW."commission_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "event_id" INTO gestion_comision
  FROM "commissions" WHERE "id" = NEW."commission_id";

  IF gestion_comision <> NEW."event_id" THEN
    RAISE EXCEPTION
      'La comision pertenece a otra gestion que el asiento (EVT-008)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_entries_commission_same_event ON "journal_entries";
CREATE TRIGGER journal_entries_commission_same_event
  BEFORE INSERT ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION journal_entry_commission_same_event();
