-- Inmutabilidad de las lineas contables — ACC-003, GOV-005, GOV-009.
--
-- P12 protegio la cabecera del asiento y no las lineas: `journal_entries` tiene
-- sus triggers `no_update` y `no_delete`, y `journal_lines` no tenia ninguno.
-- Su unico guardian era el CONSTRAINT TRIGGER diferido de cuadre, que ademas se
-- rinde cuando ya no queda ninguna linea:
--
--   IF line_count = 0 THEN RETURN NULL; END IF;
--
-- Con eso, `DELETE FROM journal_lines WHERE entry_id = '<asiento>'` vaciaba un
-- asiento ya contabilizado sin que nada protestara: la cabecera sobrevivia
-- intacta y el cuadre se comprobaba sobre cero lineas. El asiento seguia
-- existiendo, cuadrado por vacuidad, y sin mover un centimo.
--
-- ACC-003 dice que un asiento contabilizado no se edita y que la correccion es
-- una reversion enlazada. GOV-009 excluye el borrado fisico de asientos. Las
-- lineas SON el asiento.

-- 1. Las dos barreras que faltaban, con la misma funcion que ya usa la cabecera.
CREATE TRIGGER journal_lines_no_update
  BEFORE UPDATE ON "journal_lines"
  FOR EACH ROW EXECUTE FUNCTION accounting_append_only();

CREATE TRIGGER journal_lines_no_delete
  BEFORE DELETE ON "journal_lines"
  FOR EACH ROW EXECUTE FUNCTION accounting_append_only();

-- 2. Cerrar la salida por vacuidad del trigger de cuadre.
--
-- Con los triggers de arriba, llegar a cero lineas ya no es alcanzable. Se
-- cambia igualmente porque la salida silenciosa era el fallo de fondo: si
-- manana una migracion descuidada retira un trigger, el cuadre volveria a dar
-- por bueno un asiento vacio. Un asiento sin lineas no cuadra, no esta exento.
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

  IF line_count < 2 THEN
    RAISE EXCEPTION 'Un asiento necesita al menos dos lineas; tiene %', line_count
      USING ERRCODE = 'check_violation';
  END IF;

  IF debit_total <> credit_total THEN
    RAISE EXCEPTION 'El asiento no cuadra: debe % contra haber %', debit_total, credit_total
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
