-- La referencia bancaria distinguía mayúsculas — PAY-027.
--
-- `@@unique([event_id, reference])` es sensible a la caja, así que `TRX-9981` y
-- `trx-9981` convivían como evidencias distintas de la misma transferencia. El
-- índice no colisionaba, la segunda evidencia se creaba, y el mismo comprobante
-- bancario podía aprobarse dos veces: un ingreso duplicado que no entró y que no
-- se detecta hasta el arqueo.
--
-- PAY-027 dice «referencia duplicada se bloquea o marca para revisión». Una
-- comparación que se puede esquivar cambiando una letra a minúscula no bloquea
-- nada.
--
-- Se migra la columna a CITEXT, que es lo que este esquema ya usa para
-- `users.email` por la misma razón (IAM-001: «el correo normalizado es único; el
-- correo visible conserva su formato original»). La extensión se instaló en la
-- migración de P03.
--
-- **Solo la caja, no los espacios.** `TRX 9981` y `TRX-9981` siguen siendo
-- referencias distintas: colapsar espacios o guiones fusionaría referencias
-- genuinamente diferentes de bancos que las formatean así, y eso rechazaría
-- pagos legítimos. Se corrige lo que es seguro corregir.

-- 1. Detectar colisiones que la caja escondía, antes de crear el índice.
--
--    Si dos evidencias de la misma gestión solo se diferencian en mayúsculas,
--    el ALTER de abajo fallaría con un error de índice único sin explicar por
--    qué. Esto lo dice claro y detiene la migración a propósito: fusionarlas
--    automáticamente sería decidir cuál de los dos pagos es el bueno.
DO $$
DECLARE colisiones int;
BEGIN
  SELECT count(*) INTO colisiones FROM (
    SELECT "event_id", lower("reference")
      FROM "payment_proofs"
     GROUP BY "event_id", lower("reference")
    HAVING count(*) > 1
  ) AS duplicadas;

  IF colisiones > 0 THEN
    RAISE EXCEPTION
      'Hay % grupo(s) de evidencias que solo se diferencian en mayusculas. '
      'Resuelvalos a mano antes de aplicar esta migracion: decidir cual pago es '
      'el valido no le corresponde a un script.', colisiones
      USING ERRCODE = 'unique_violation';
  END IF;
END $$;

-- 2. La columna pasa a ser insensible a la caja. El índice único existente la
--    acompaña automáticamente: CITEXT cambia el operador de igualdad.
ALTER TABLE "payment_proofs"
  ALTER COLUMN "reference" TYPE CITEXT;
