-- La auditoria sabe de comisiones — SRV-023.
--
-- «El administrador master ve la auditoria completa; el encargado de area, solo
-- la de sus comisiones.» Hasta ahora `audit_logs` tenia gestion, actor, accion
-- y entidad, y nada mas: filtrar por area habria exigido deducir la comision a
-- partir del tipo de entidad, que es adivinar y no filtrar.
--
-- Se anade ahora y no cuando llegue la pantalla, a proposito: `audit_logs` es
-- de solo anexado y crece con cada operacion del evento. Un ALTER TABLE sobre
-- ella dentro de un ano es una ventana de mantenimiento; hoy es instantaneo.
--
-- Nula en casi todo, y eso es lo correcto para la regla: una accion sin
-- comision —un cobro, un cierre, un cambio de configuracion— **no** la ve un
-- encargado de area, asi que queda fuera de su filtro sin ninguna excepcion
-- escrita a mano.

ALTER TABLE "audit_logs" ADD COLUMN "commission_id" UUID;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_commission_id_fkey"
  FOREIGN KEY ("commission_id") REFERENCES "commissions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- El mismo par que `(event_id, created_at)` y por el mismo motivo: la consulta
-- del encargado es «lo de mis comisiones, lo mas reciente primero».
CREATE INDEX "audit_logs_commission_id_created_at_idx"
  ON "audit_logs"("commission_id", "created_at");

-- Una comision pertenece a una gestion, asi que un registro con comision y sin
-- gestion describe algo que no puede existir. No se exige lo contrario: la
-- mayoria de las acciones son de la gestion y no de una comision.
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_commission_needs_event"
  CHECK ("commission_id" IS NULL OR "event_id" IS NOT NULL);
