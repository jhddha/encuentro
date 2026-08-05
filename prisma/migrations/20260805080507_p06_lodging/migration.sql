-- DropForeignKey
ALTER TABLE "registrations" DROP CONSTRAINT "registrations_price_matches_package";

-- CreateTable
CREATE TABLE "event_lodging_policies" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "night_count" INTEGER NOT NULL,
    "check_in_date" DATE NOT NULL,
    "check_out_date" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "event_lodging_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotels" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "room_id" UUID,
    "bed_index" INTEGER,
    "check_in_date" DATE NOT NULL,
    "check_out_date" DATE NOT NULL,
    "night_count" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'HELD',
    "held_until" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_lodging_policies_event_id_key" ON "event_lodging_policies"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "hotels_event_id_code_key" ON "hotels"("event_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_hotel_id_code_key" ON "rooms"("hotel_id", "code");

-- CreateIndex
CREATE INDEX "reservations_event_id_status_idx" ON "reservations"("event_id", "status");

-- CreateIndex
CREATE INDEX "reservations_hotel_id_status_idx" ON "reservations"("hotel_id", "status");

-- AddForeignKey
ALTER TABLE "event_lodging_policies" ADD CONSTRAINT "event_lodging_policies_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotels" ADD CONSTRAINT "hotels_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- ---------------------------------------------------------------------------
-- Invariantes de hospedaje.
-- ---------------------------------------------------------------------------

-- HOS-001: al menos una noche, y fechas coherentes con la cantidad declarada.
ALTER TABLE "event_lodging_policies"
  ADD CONSTRAINT "lodging_policy_night_count_positive" CHECK ("night_count" >= 1);

ALTER TABLE "event_lodging_policies"
  ADD CONSTRAINT "lodging_policy_nights_match_dates"
  CHECK ("check_out_date" - "check_in_date" = "night_count");

ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_capacity_positive" CHECK ("capacity" >= 1);

-- Estados canonicos de reserva (contracts/states.json).
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_status_canonical"
  CHECK ("status" IN ('HELD', 'CONFIRMED', 'RELEASED', 'CANCELLED', 'EXPIRED'));

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_night_count_positive" CHECK ("night_count" >= 1);

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_dates_ordered"
  CHECK ("check_out_date" > "check_in_date");

-- DEC-005: `held_until` solo tiene sentido mientras la reserva este en HELD.
-- Dejarlo puesto en una reserva CONFIRMED invitaria a que un worker mal escrito
-- la expirara, que es justo lo que HOS-003 prohibe.
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_held_until_only_when_held"
  CHECK (("status" = 'HELD' AND "held_until" IS NOT NULL)
         OR ("status" <> 'HELD' AND "held_until" IS NULL));

-- HOS-008: el ultimo cupo.
--
-- Una plaza ocupada es una fila con (room_id, bed_index). El indice unico
-- parcial hace que Postgres decida quien gana cuando dos personas piden la
-- misma plaza a la vez, en lugar de confiar en un contador que se
-- desincroniza. Solo cuentan las reservas vivas: una liberada deja el cupo
-- disponible de nuevo.
CREATE UNIQUE INDEX "reservations_one_person_per_bed"
  ON "reservations" ("room_id", "bed_index")
  WHERE "status" IN ('HELD', 'CONFIRMED');

-- La plaza debe estar dentro de la capacidad de su habitacion. No se puede
-- expresar con un CHECK porque involucra otra tabla, asi que va por trigger.
CREATE OR REPLACE FUNCTION reservation_bed_within_capacity() RETURNS TRIGGER AS $$
DECLARE
  room_capacity INT;
BEGIN
  IF NEW."room_id" IS NULL OR NEW."bed_index" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "capacity" INTO room_capacity FROM "rooms" WHERE "id" = NEW."room_id";

  IF NEW."bed_index" < 1 OR NEW."bed_index" > room_capacity THEN
    RAISE EXCEPTION 'La plaza % excede la capacidad % de la habitacion (HOS-008)',
      NEW."bed_index", room_capacity
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reservations_bed_within_capacity
  BEFORE INSERT OR UPDATE ON "reservations"
  FOR EACH ROW EXECUTE FUNCTION reservation_bed_within_capacity();

-- Una inscripcion no puede tener dos reservas vivas a la vez.
CREATE UNIQUE INDEX "reservations_one_live_per_registration"
  ON "reservations" ("registration_id")
  WHERE "status" IN ('HELD', 'CONFIRMED');
