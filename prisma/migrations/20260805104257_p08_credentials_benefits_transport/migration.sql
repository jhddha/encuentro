-- CreateTable
CREATE TABLE "credentials" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "revoke_reason" TEXT,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stations" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'GENERAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_services" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "service_date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "available_count" INTEGER NOT NULL,
    "ordered_count" INTEGER NOT NULL DEFAULT 0,
    "received_count" INTEGER NOT NULL DEFAULT 0,
    "wasted_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "meal_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_deliveries" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "operation_uuid" TEXT NOT NULL,
    "delivered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overridden_by" UUID,
    "override_reason" TEXT,

    CONSTRAINT "meal_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_deliveries" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "operation_uuid" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "delivered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "plate" TEXT,
    "capacity" INTEGER NOT NULL,
    "driver_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "departs_at" TIMESTAMPTZ(6) NOT NULL,
    "arrives_at" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credentials_registration_id_key" ON "credentials"("registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "credentials_token_hash_key" ON "credentials"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "credentials_event_id_code_key" ON "credentials"("event_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "stations_event_id_code_key" ON "stations"("event_id", "code");

-- CreateIndex
CREATE INDEX "meal_services_event_id_service_date_idx" ON "meal_services"("event_id", "service_date");

-- CreateIndex
CREATE UNIQUE INDEX "meal_services_event_id_service_date_type_key" ON "meal_services"("event_id", "service_date", "type");

-- CreateIndex
CREATE INDEX "meal_deliveries_service_id_idx" ON "meal_deliveries"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_deliveries_service_id_registration_id_key" ON "meal_deliveries"("service_id", "registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_deliveries_station_id_operation_uuid_key" ON "meal_deliveries"("station_id", "operation_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_event_id_code_key" ON "inventory_items"("event_id", "code");

-- CreateIndex
CREATE INDEX "inventory_movements_item_id_created_at_idx" ON "inventory_movements"("item_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "material_deliveries_item_id_registration_id_key" ON "material_deliveries"("item_id", "registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_deliveries_station_id_operation_uuid_key" ON "material_deliveries"("station_id", "operation_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_event_id_code_key" ON "vehicles"("event_id", "code");

-- CreateIndex
CREATE INDEX "trips_vehicle_id_departs_at_idx" ON "trips"("vehicle_id", "departs_at");

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stations" ADD CONSTRAINT "stations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_services" ADD CONSTRAINT "meal_services_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_deliveries" ADD CONSTRAINT "meal_deliveries_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "meal_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_deliveries" ADD CONSTRAINT "meal_deliveries_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_deliveries" ADD CONSTRAINT "meal_deliveries_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariantes de credenciales, alimentos, materiales y transporte.
-- ---------------------------------------------------------------------------

-- FOOD-001: ventana valida y cantidades no negativas.
ALTER TABLE "meal_services"
  ADD CONSTRAINT "meal_services_window_ordered" CHECK ("ends_at" > "starts_at");

ALTER TABLE "meal_services"
  ADD CONSTRAINT "meal_services_counts_non_negative" CHECK (
    "available_count" >= 0 AND "ordered_count" >= 0
    AND "received_count" >= 0 AND "wasted_count" >= 0
  );

-- FOOD-004: un override debe llevar responsable y motivo. Una excepcion sin
-- explicacion no serviria para auditar por que alguien comio dos veces.
ALTER TABLE "meal_deliveries"
  ADD CONSTRAINT "meal_deliveries_override_is_complete" CHECK (
    ("overridden_by" IS NULL AND "override_reason" IS NULL)
    OR ("overridden_by" IS NOT NULL
        AND "override_reason" IS NOT NULL AND length(trim("override_reason")) > 0)
  );

-- MAT-003: clases de movimiento canonicas.
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_kind_canonical"
  CHECK ("kind" IN ('RECEIPT', 'ISSUE', 'ADJUSTMENT', 'LOSS', 'DELIVERY'));

-- Solo un ajuste puede ser negativo; el resto de movimientos son cantidades
-- positivas cuyo signo lo determina su clase.
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_quantity_sign" CHECK (
    ("kind" = 'ADJUSTMENT' AND "quantity" <> 0)
    OR ("kind" <> 'ADJUSTMENT' AND "quantity" > 0)
  );

ALTER TABLE "material_deliveries"
  ADD CONSTRAINT "material_deliveries_quantity_positive" CHECK ("quantity" > 0);

-- GOV-009: las entregas no se borran ni se reescriben. Una entrega revertida
-- se registra como movimiento de inventario, no borrando la fila.
CREATE OR REPLACE FUNCTION deliveries_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Las entregas son append-only: % no esta permitido (GOV-009)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER meal_deliveries_no_update
  BEFORE UPDATE ON "meal_deliveries"
  FOR EACH ROW EXECUTE FUNCTION deliveries_append_only();

CREATE TRIGGER meal_deliveries_no_delete
  BEFORE DELETE ON "meal_deliveries"
  FOR EACH ROW EXECUTE FUNCTION deliveries_append_only();

CREATE TRIGGER material_deliveries_no_update
  BEFORE UPDATE ON "material_deliveries"
  FOR EACH ROW EXECUTE FUNCTION deliveries_append_only();

CREATE TRIGGER material_deliveries_no_delete
  BEFORE DELETE ON "material_deliveries"
  FOR EACH ROW EXECUTE FUNCTION deliveries_append_only();

CREATE TRIGGER inventory_movements_no_update
  BEFORE UPDATE ON "inventory_movements"
  FOR EACH ROW EXECUTE FUNCTION deliveries_append_only();

CREATE TRIGGER inventory_movements_no_delete
  BEFORE DELETE ON "inventory_movements"
  FOR EACH ROW EXECUTE FUNCTION deliveries_append_only();

-- INFERIDO (P08): revocar una credencial exige responsable y motivo, por
-- coherencia con la anulacion de comprobantes (PAY-015). No hay requisito que
-- lo exija; se aplica el mismo criterio que al resto de acciones destructivas.
ALTER TABLE "credentials"
  ADD CONSTRAINT "credentials_revoke_is_complete" CHECK (
    "revoked_at" IS NULL
    OR ("revoked_by" IS NOT NULL
        AND "revoke_reason" IS NOT NULL AND length(trim("revoke_reason")) > 0)
  );

-- INFERIDO (P10): capacidad positiva y horario coherente. El prompt P10 pide un
-- gate de "solapamientos y capacidad"; estas son las precondiciones minimas.
ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_capacity_positive" CHECK ("capacity" >= 1);

ALTER TABLE "trips"
  ADD CONSTRAINT "trips_schedule_ordered" CHECK ("arrives_at" > "departs_at");

-- INFERIDO (P10): un vehiculo no puede estar en dos traslados solapados.
-- Requiere btree_gist para combinar igualdad y rango en la misma exclusion.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "trips" ADD CONSTRAINT "trips_no_vehicle_overlap"
  EXCLUDE USING gist (
    "vehicle_id" WITH =,
    tstzrange("departs_at", "arrives_at") WITH &&
  ) WHERE ("status" <> 'CANCELLED');
