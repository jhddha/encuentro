-- Los roles de ingreso del peregrino pasan de tres por concepto a dos por origen.
--
-- DEC-018 fijaba `REGISTRATION_REVENUE`, `LODGING_REVENUE` y
-- `TRANSPORT_REVENUE`: un ingreso por cada concepto del cargo. La contabilidad
-- real de la organización no funciona así.
--
-- El peregrino **no paga una cuota por partidas: da una ofrenda**. El hospedaje
-- y el transporte están dentro de ella y son gastos, no ingresos — su plan de
-- cuentas no tiene ninguna cuenta de ingreso para ellos. Lo que sí distingue es
-- el origen: «ofrenda peregrino nacional» (411010001) e «internacional»
-- (411010002) son dos cuentas.
--
-- Por eso los nombres cambian además de partirse. `REGISTRATION_REVENUE`
-- describía un modelo que esta organización no usa; `PILGRIM_OFFERING_*`
-- describe el que sí.
--
-- La separación por concepto no se pierde: sigue viva en los cargos, que es
-- donde hace falta para cobrar y para el estado de cuenta. Lo que no hace es
-- llegar al libro.
--
-- Ninguna cuenta tiene todavía estos roles asignados, y `journal_lines` está
-- vacía: el cambio no toca ningún asiento.

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
