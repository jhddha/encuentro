-- Un rol contable por moneda, no uno por gestión.
--
-- El índice `accounts_chart_event_role_key` admitía una sola cuenta por rol y
-- gestión. Eso presupone que la gestión opera en una moneda, y el plan de
-- cuentas real de la organización dice lo contrario: separa «caja moneda
-- nacional» de «caja moneda extranjera» como dos cuentas distintas, que es la
-- forma habitual de llevar libros con divisas.
--
-- Sin este cambio, una gestión que cobre en bolivianos y en dólares —decisión
-- del 11 de agosto de 2026— no puede tener las dos cajas configuradas, y el
-- motor de la fase 11 no tendría dónde imputar la mitad de los cobros.
--
-- El disparador `journal_line_must_match_entry` ya exige que la moneda de la
-- línea, la del asiento y la de la cuenta coincidan. Este índice es su
-- complemento: permite que exista la cuenta correcta para cada moneda, y sigue
-- impidiendo dos cuentas para el mismo rol **en la misma moneda**, que sí sería
-- una ambigüedad.

DROP INDEX IF EXISTS "accounts_chart_event_role_key";

CREATE UNIQUE INDEX "accounts_chart_event_role_currency_key"
  ON "accounts_chart" ("event_id", "role", "currency")
  WHERE "role" IS NOT NULL;
