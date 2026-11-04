ALTER TYPE "inventory_movement_type" ADD VALUE IF NOT EXISTS 'physical_count';
--> statement-breakpoint
CREATE TYPE "inventory_count_status" AS ENUM ('draft', 'applied', 'cancelled');
CREATE TABLE "inventory_stock_revision" (
  "location_id" text NOT NULL REFERENCES "inventory_location"("id") ON DELETE RESTRICT,
  "inventory_item_id" text NOT NULL REFERENCES "inventory_item"("id") ON DELETE RESTRICT,
  "revision" bigint NOT NULL DEFAULT 0,
  CONSTRAINT "inventory_stock_revision_pkey" PRIMARY KEY ("location_id", "inventory_item_id")
);
CREATE TABLE "inventory_count" (
  "id" text PRIMARY KEY,
  "location_id" text NOT NULL REFERENCES "inventory_location"("id") ON DELETE RESTRICT,
  "status" inventory_count_status NOT NULL DEFAULT 'draft',
  "version" integer NOT NULL DEFAULT 1,
  "observations" text,
  "created_by_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "applied_by_user_id" text REFERENCES "user"("id") ON DELETE RESTRICT,
  "applied_at" timestamptz,
  "cancelled_by_user_id" text REFERENCES "user"("id") ON DELETE RESTRICT,
  "cancelled_at" timestamptz,
  "movement_id" text REFERENCES "inventory_movement"("id") ON DELETE RESTRICT,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "inventory_count_state_check" CHECK (
    (status = 'draft' AND applied_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'applied' AND applied_at IS NOT NULL AND applied_by_user_id IS NOT NULL AND cancelled_at IS NULL)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL AND cancelled_by_user_id IS NOT NULL AND applied_at IS NULL)
  )
);
CREATE INDEX "inventory_count_location_created_idx" ON "inventory_count" ("location_id", "created_at");
CREATE TABLE "inventory_count_item" (
  "id" text PRIMARY KEY,
  "count_id" text NOT NULL REFERENCES "inventory_count"("id") ON DELETE RESTRICT,
  "inventory_item_id" text NOT NULL REFERENCES "inventory_item"("id") ON DELETE RESTRICT,
  "snapshot" jsonb NOT NULL,
  "stock_revision" bigint NOT NULL,
  "reference_at" timestamptz NOT NULL
);
CREATE UNIQUE INDEX "inventory_count_item_unique" ON "inventory_count_item" ("count_id", "inventory_item_id");
CREATE INDEX "inventory_count_item_count_idx" ON "inventory_count_item" ("count_id");
CREATE TABLE "inventory_count_line" (
  "id" text PRIMARY KEY,
  "count_item_id" text NOT NULL REFERENCES "inventory_count_item"("id") ON DELETE RESTRICT,
  "lot_id" text REFERENCES "inventory_lot"("id") ON DELETE RESTRICT,
  "lot_code" text,
  "expires_on" date,
  "system_quantity" numeric(12,6) NOT NULL,
  "counted_quantity" numeric(12,6),
  "previous_counted_quantity" numeric(12,6),
  "applied_delta" numeric(12,6),
  CONSTRAINT "inventory_count_line_quantity_check" CHECK (system_quantity >= 0 AND (counted_quantity IS NULL OR counted_quantity >= 0))
);
CREATE INDEX "inventory_count_line_item_idx" ON "inventory_count_line" ("count_item_id");
--> statement-breakpoint
-- Track every physical balance change, including net-zero pairs of movements.
-- Reservation-only updates intentionally leave the physical revision unchanged.
CREATE FUNCTION inventory_track_stock_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.on_hand_quantity <> 0 THEN
      INSERT INTO inventory_stock_revision (location_id, inventory_item_id, revision)
      VALUES (OLD.location_id, OLD.inventory_item_id, 1)
      ON CONFLICT (location_id, inventory_item_id) DO UPDATE
      SET revision = inventory_stock_revision.revision + 1;
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.location_id, NEW.inventory_item_id, NEW.lot_id) IS DISTINCT FROM (OLD.location_id, OLD.inventory_item_id, OLD.lot_id) THEN
      RAISE EXCEPTION 'Inventory balance keys are immutable';
    END IF;
    IF NEW.on_hand_quantity = OLD.on_hand_quantity THEN RETURN NEW; END IF;
  ELSIF NEW.on_hand_quantity = 0 THEN
    RETURN NEW;
  END IF;
  INSERT INTO inventory_stock_revision (location_id, inventory_item_id, revision)
  VALUES (NEW.location_id, NEW.inventory_item_id, 1)
  ON CONFLICT (location_id, inventory_item_id) DO UPDATE
  SET revision = inventory_stock_revision.revision + 1;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_balance_stock_revision
AFTER INSERT OR UPDATE OR DELETE ON inventory_balance
FOR EACH ROW EXECUTE FUNCTION inventory_track_stock_revision();
