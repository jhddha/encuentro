-- P17 — Esquema contable exigido por DEC-018
--
-- La tabla de asientos esta vacia. Es el momento barato de imponer estas
-- restricciones: despues de contabilizar la primera operacion real, cualquiera
-- de ellas obliga a migrar datos.

-- ---------------------------------------------------------------------------
-- 1. Rol contable en el plan de cuentas
--
-- DEC-018 fija roles, no numeros de cuenta. La organizacion asigna a cada rol
-- una cuenta de su plan. El CHECK enumera los roles porque el catalogo es una
-- decision aprobada: anadir uno exige otra decision y otra migracion, que es
-- exactamente la friccion que debe tener.
-- ---------------------------------------------------------------------------

ALTER TABLE "accounts_chart" ADD COLUMN "role" TEXT;

ALTER TABLE "accounts_chart"
  ADD CONSTRAINT "accounts_chart_role_canonical"
  CHECK ("role" IS NULL OR "role" IN (
    'CASH_ON_HAND', 'BANK_ACCOUNT', 'QR_CLEARING', 'PAYMENT_GATEWAY_CLEARING',
    'REGISTRATION_REVENUE', 'LODGING_REVENUE', 'TRANSPORT_REVENUE',
    'MONETARY_DONATION_REVENUE', 'IN_KIND_DONATION_REVENUE',
    'PARTICIPANT_ADVANCES', 'ACCOUNTS_PAYABLE', 'STAFF_REIMBURSEMENTS_PAYABLE',
    'ADVANCES_TO_ACCOUNT_FOR', 'INVENTORY', 'FIXED_ASSETS',
    'OPERATING_EXPENSE', 'FOOD_AND_MATERIALS_EXPENSE', 'LOSS_AND_WASTE_EXPENSE',
    'PAYMENT_PROCESSING_FEES',
    'RECONCILIATION_DIFFERENCES', 'INVENTORY_SURPLUS'
  ));

-- Un rol corresponde como mucho a una cuenta por gestion. Dos cuentas con el
-- mismo rol dejarian al resolvedor sin criterio para elegir.
CREATE UNIQUE INDEX "accounts_chart_event_role_key"
  ON "accounts_chart" ("event_id", "role")
  WHERE "role" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Tipo de asiento y version de la regla aplicada
-- ---------------------------------------------------------------------------

ALTER TABLE "journal_entries" ADD COLUMN "entry_kind" TEXT;
ALTER TABLE "journal_entries" ADD COLUMN "rule_version" INTEGER;

-- ---------------------------------------------------------------------------
-- 3. Idempotencia — ACC-002 y DEC-018 seccion 7
--
-- La llave es event_id + source_type + source_id + entry_kind.
--
-- `rule_version` se guarda para trazabilidad pero **no participa de la
-- unicidad**. Incluirla romperia la idempotencia: una fuente contabilizada con
-- la regla v1 volveria a contabilizarse al subir las reglas a v2, porque la
-- llave cambiaria. Es el asiento duplicado que ACC-002 existe para impedir.
--
-- El indice es parcial: un asiento manual, sin fuente ni tipo, no queda
-- restringido. Solo se controla lo que genera el motor.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "journal_entries_idempotency"
  ON "journal_entries" ("event_id", "source_entity", "source_id", "entry_kind")
  WHERE "source_entity" IS NOT NULL
    AND "source_id" IS NOT NULL
    AND "entry_kind" IS NOT NULL;
