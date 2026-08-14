-- Rol contable de la inscripción de servidor — DEC-020.
--
-- El módulo de servidores trae un ingreso que DEC-018 no contemplaba: la
-- inscripción del propio servidor, cuando la organización decide cobrarla. El
-- documento de administración pide de forma explícita que no se mezcle con los
-- pagos de peregrinos, y mezclarla haría además que el ingreso por peregrinos
-- dejara de ser comparable entre gestiones.
--
-- Pasa a ser el vigésimo segundo rol. La cuenta que lo representa en el plan
-- real es `411010003`, del mismo grupo que las dos ofrendas de peregrino porque
-- es lo mismo: ingreso por la inscripción de una persona.
--
-- El CHECK se enumera entero en vez de ampliarse porque Postgres no admite
-- añadir un valor a un `IN` existente: hay que soltarlo y volver a ponerlo. Y
-- vale la pena que la lista esté completa en un solo sitio de cada migración,
-- para poder leer qué roles había en cada momento sin encadenar diffs.
--
-- Ninguna cuenta tiene todavía este rol y `journal_lines` sigue vacía: el
-- cambio no toca ningún asiento.

ALTER TABLE "accounts_chart" DROP CONSTRAINT IF EXISTS "accounts_chart_role_canonical";

ALTER TABLE "accounts_chart"
  ADD CONSTRAINT "accounts_chart_role_canonical" CHECK (
    "role" IS NULL OR "role" IN (
      -- Financieras
      'CASH_ON_HAND',
      'BANK_ACCOUNT',
      'QR_CLEARING',
      'PAYMENT_GATEWAY_CLEARING',
      -- Ingresos
      'PILGRIM_OFFERING_DOMESTIC',
      'PILGRIM_OFFERING_INTERNATIONAL',
      'SERVER_REGISTRATION_REVENUE',
      'MONETARY_DONATION_REVENUE',
      'IN_KIND_DONATION_REVENUE',
      -- Pasivo
      'PARTICIPANT_ADVANCES',
      'ACCOUNTS_PAYABLE',
      'STAFF_REIMBURSEMENTS_PAYABLE',
      -- Activo
      'ADVANCES_TO_ACCOUNT_FOR',
      'INVENTORY',
      'FIXED_ASSETS',
      -- Egresos
      'OPERATING_EXPENSE',
      'FOOD_AND_MATERIALS_EXPENSE',
      'LOSS_AND_WASTE_EXPENSE',
      'PAYMENT_PROCESSING_FEES',
      -- Ajustes
      'RECONCILIATION_DIFFERENCES',
      'INVENTORY_SURPLUS'
    )
  );
