-- Coherencia de asientos contables: moneda, gestión, líneas y clase.
--
-- Cuatro huecos del esquema contable, encontrados por una auditoría contra la
-- base y probados uno a uno en transacciones revertidas. Las tres tablas están
-- vacías y no existe todavía motor de contabilización (fase 11), así que el
-- coste hoy es cero y después sería una corrección de datos.

-- ---------------------------------------------------------------------------
-- 1. Una línea no puede mezclar moneda con su asiento, ni cuenta con otra
--    gestión.
--
-- La primera mitad estaba **anunciada y sin escribir**: la migración
-- 20260805105854 dejó el comentario «Una linea no puede mezclar moneda con su
-- asiento» y detrás la sentencia siguiente era de `notifications`. El comentario
-- quedó huérfano y la restricción nunca existió.
--
-- Consecuencia medida: `journal_entry_must_balance()` suma `amount` sin agrupar
-- por moneda, así que 100 al debe en USD «cuadraban» contra 100 al haber en EUR.
-- ACC-001 —el único invariante que requirements.md declara no inferido— quedaba
-- satisfecho por coincidencia numérica y no por equivalencia de valor. Y como el
-- asiento es de solo anexado, un asiento así no se corrige: se arrastra.
--
-- La segunda mitad nunca se anunció. `journal_lines_account_id_fkey` valida que
-- la cuenta exista, no de quién es, así que una línea de un asiento de ENC2026
-- podía apuntar al plan de cuentas de ENC2027. EVT-008 está enunciado en
-- negativo justamente por esto: el riesgo de una gestión no es olvidar un hotel,
-- es arrastrar sin darse cuenta un movimiento del año anterior. Es además una
-- fuga de alcance: el scope de contabilidad es por gestión, y una línea podía
-- tocar el plan de una gestión sobre la que el actor no tiene permiso.
--
-- Se resuelve con un disparador y no con claves foráneas compuestas porque estas
-- exigirían denormalizar `event_id` en `journal_lines`, y con ello tocar el
-- modelo de Prisma, el cliente generado y las pruebas de una tabla que todavía
-- no escribe nadie. `journal_lines` es de solo anexado —no admite UPDATE— así
-- que validar en la inserción cubre todos los caminos que existen.
CREATE OR REPLACE FUNCTION journal_line_must_match_entry() RETURNS TRIGGER AS $$
DECLARE
  entrada RECORD;
  cuenta RECORD;
BEGIN
  SELECT "event_id", "currency" INTO entrada
  FROM "journal_entries" WHERE "id" = NEW."entry_id";

  SELECT "event_id", "currency", "active" INTO cuenta
  FROM "accounts_chart" WHERE "id" = NEW."account_id";

  IF NEW."currency" <> entrada."currency" THEN
    RAISE EXCEPTION
      'La linea esta en % y su asiento en %: un asiento no mezcla monedas (ACC-001)',
      NEW."currency", entrada."currency";
  END IF;

  IF cuenta."currency" <> entrada."currency" THEN
    RAISE EXCEPTION
      'La cuenta esta en % y el asiento en %: la linea no puede cuadrar (ACC-001)',
      cuenta."currency", entrada."currency";
  END IF;

  IF cuenta."event_id" <> entrada."event_id" THEN
    RAISE EXCEPTION
      'La cuenta pertenece a otra gestion que el asiento: el mayor dejaria de ser reconstruible por gestion (EVT-008)';
  END IF;

  -- Una cuenta desactivada conserva su histórico y no admite movimientos
  -- nuevos. Sin esto, desactivarla no significa nada.
  IF NOT cuenta."active" THEN
    RAISE EXCEPTION 'La cuenta esta desactivada y no admite movimientos nuevos';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_lines_match_entry
  BEFORE INSERT ON "journal_lines"
  FOR EACH ROW EXECUTE FUNCTION journal_line_must_match_entry();

-- ---------------------------------------------------------------------------
-- 2. Una cabecera de asiento sin ninguna línea.
--
-- `journal_entry_must_balance()` cuelga de `journal_lines`, así que un asiento
-- al que nunca se le insertó una línea no dispara nada: se guarda sin error, es
-- indestructible —solo anexado— y ocupa para siempre su clave de idempotencia
-- (`event_id, source_entity, source_id, entry_kind`). El motor de la fase 11
-- que reintente contabilizar esa misma fuente encontrará la clave tomada y dará
-- por hecho un asiento que no existe.
--
-- Diferido hasta el commit: dentro de la transacción el asiento se inserta antes
-- que sus líneas, y comprobarlo de inmediato haría imposible escribirlo.
CREATE OR REPLACE FUNCTION journal_entry_must_have_lines() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "journal_lines" WHERE "entry_id" = NEW."id") THEN
    RAISE EXCEPTION
      'El asiento % no tiene ninguna linea: quedaria indestructible y bloqueando su clave de idempotencia (ACC-002)',
      NEW."id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER journal_entries_have_lines
  AFTER INSERT ON "journal_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION journal_entry_must_have_lines();

-- ---------------------------------------------------------------------------
-- 3. `entry_kind` era texto libre, y forma parte de la clave de idempotencia.
--
-- Una variante ortográfica —'REVERSAL' frente a 'Reversal'— produce una clave
-- distinta para la misma fuente y duplica el asiento. Los veintiún valores son
-- exactamente los `entryKind` de `contracts/accounting-rules.json` (DEC-018,
-- rulesVersion 1); no se añade ninguno.
--
-- Admite NULL porque la columna es opcional en el esquema y el índice de
-- idempotencia solo cubre las filas donde no lo es.
ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_entry_kind_canonical"
  CHECK ("entry_kind" IS NULL OR "entry_kind" IN (
    'ADVANCE_APPLICATION',
    'ADVANCE_CLEARING',
    'ADVANCE_RETURN',
    'ADVANCE_TO_ACCOUNT_FOR',
    'DONATION_IN_KIND',
    'DONATION_RECEIVED',
    'GATEWAY_SETTLEMENT',
    'INVENTORY_IN_ADJUSTMENT',
    'INVENTORY_LOSS',
    'INVENTORY_OUT',
    'PARTICIPANT_ADVANCE',
    'PAYABLE_SETTLEMENT',
    'PURCHASE',
    'PURCHASE_PAYABLE',
    'RECONCILIATION_ADJUSTMENT',
    'REVENUE_RECOGNITION',
    'REVENUE_REVERSAL_TO_ADVANCE',
    'REVERSAL',
    'STAFF_REIMBURSEMENT_ACCRUAL',
    'STAFF_REIMBURSEMENT_SETTLEMENT',
    'TRANSFER'
  ));
