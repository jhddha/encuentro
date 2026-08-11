-- Registro diario de tasa de cambio — cierra TBD-001.
--
-- DEC-009 dice que la tasa se congela al cargar la evidencia, y
-- `payment_proofs.exchange_rate_micros` existe para guardarla. Lo que faltaba
-- era de dónde sacarla: no había ninguna tasa configurada en el esquema, y
-- congelar sin fuente significa inventar un número que acaba impreso en un
-- comprobante. Por eso `assertDeclarableEvidence` rechazaba cobrar en una
-- moneda distinta a la de la gestión.
--
-- POR QUÉ UNA PANTALLA Y NO UNA FUENTE WEB
--
-- El número sostiene una conciliación y acaba en papel. Si lo trae una página,
-- cuando alguien lo discuta dentro de seis meses la respuesta es «lo dijo una
-- web» — que pudo cambiar, caer, o no ser la que la organización considera
-- válida. En Bolivia circula más de una tasa y elegir cuál no es una decisión
-- técnica.
--
-- Registrada por una persona con permiso, queda **quién y cuándo**. Eso se
-- defiende, y funciona sin internet, que en un encuentro presencial no es un
-- detalle menor.

CREATE TABLE "exchange_rates" (
  "id"       UUID NOT NULL,
  "event_id" UUID NOT NULL,

  -- La moneda extranjera. La de destino es siempre la de la gestión: la tasa
  -- expresa cuántas unidades de la moneda funcional vale una de esta.
  "currency" CHAR(3) NOT NULL,

  -- Micros, como `payment_proofs.exchange_rate_micros`: entero, nunca float
  -- (NFR-014). 6,96 BOB por dólar se guarda como 6960000.
  "rate_micros" BIGINT NOT NULL,

  -- Día civil de la gestión al que aplica, no un instante. La tasa es del día.
  "effective_on" DATE NOT NULL,

  -- Quién la registró. Es el dato que hace defendible el número.
  "actor_id" UUID NOT NULL,

  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- Una sola tasa por gestión, moneda y día: dos serían una ambigüedad que
-- alguien resolvería adivinando.
CREATE UNIQUE INDEX "exchange_rates_event_currency_day_key"
  ON "exchange_rates" ("event_id", "currency", "effective_on");

CREATE INDEX "exchange_rates_event_effective_idx"
  ON "exchange_rates" ("event_id", "effective_on" DESC);

ALTER TABLE "exchange_rates"
  ADD CONSTRAINT "exchange_rates_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "exchange_rates"
  ADD CONSTRAINT "exchange_rates_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE RESTRICT;

-- Una tasa de cero o negativa no es una tasa. Sin esto, un cero convertiría
-- cualquier cobro en nada y el asiento cuadraría igual.
ALTER TABLE "exchange_rates"
  ADD CONSTRAINT "exchange_rates_positive" CHECK ("rate_micros" > 0);

-- La moneda de la tasa no puede ser la de la gestión: convertir bolivianos a
-- bolivianos no significa nada, y una fila así haría que el resolutor eligiera
-- entre dos caminos para el mismo cobro.
CREATE OR REPLACE FUNCTION exchange_rate_currency_is_foreign() RETURNS TRIGGER AS $$
DECLARE
  funcional CHAR(3);
BEGIN
  SELECT "currency" INTO funcional FROM "events" WHERE "id" = NEW."event_id";

  IF NEW."currency" = funcional THEN
    RAISE EXCEPTION
      'La tasa es de % contra la misma moneda de la gestion: no hay nada que convertir',
      NEW."currency";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exchange_rates_currency_is_foreign
  BEFORE INSERT OR UPDATE ON "exchange_rates"
  FOR EACH ROW EXECUTE FUNCTION exchange_rate_currency_is_foreign();
