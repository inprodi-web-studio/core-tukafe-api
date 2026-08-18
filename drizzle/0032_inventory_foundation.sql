CREATE TYPE "public"."inventory_adjustment_direction" AS ENUM('entry', 'exit');
--> statement-breakpoint
CREATE TYPE "public"."inventory_adjustment_reason" AS ENUM('initial_inventory', 'correction', 'internal_recovery', 'waste', 'expiration', 'damage', 'internal_use', 'other');
--> statement-breakpoint
CREATE TYPE "public"."inventory_item_kind" AS ENUM('ingredient', 'supply', 'product', 'variation');
--> statement-breakpoint
CREATE TYPE "public"."inventory_location_type" AS ENUM('branch', 'distribution_center');
--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('adjustment_entry', 'adjustment_exit', 'adjustment_reversal', 'checkout_reserve', 'order_reserve', 'reservation_release', 'sale_consumption');
--> statement-breakpoint
CREATE TYPE "public"."inventory_override_target_type" AS ENUM('product', 'variation', 'modifier_option');
--> statement-breakpoint
CREATE TYPE "public"."inventory_reservation_kind" AS ENUM('checkout', 'order');
--> statement-breakpoint
CREATE TYPE "public"."inventory_reservation_status" AS ENUM('active', 'partially_consumed', 'consumed', 'released', 'expired');
--> statement-breakpoint
CREATE TYPE "public"."product_inventory_tracking_mode" AS ENUM('untracked', 'recipe', 'finished_good', 'derived');
--> statement-breakpoint

ALTER TABLE "ingredient" ADD COLUMN "is_inventory_tracked" boolean DEFAULT true NOT NULL;
ALTER TABLE "ingredient" ADD COLUMN "tracks_lots" boolean DEFAULT false NOT NULL;
ALTER TABLE "ingredient" ADD COLUMN "is_perishable" boolean DEFAULT false NOT NULL;
ALTER TABLE "ingredient" ADD COLUMN "expiration_warning_days" integer DEFAULT 3 NOT NULL;
ALTER TABLE "ingredient" ADD CONSTRAINT "ingredient_expiration_warning_days_non_negative_check" CHECK ("expiration_warning_days" >= 0);
--> statement-breakpoint
ALTER TABLE "supply" ADD COLUMN "is_inventory_tracked" boolean DEFAULT true NOT NULL;
ALTER TABLE "supply" ADD COLUMN "tracks_lots" boolean DEFAULT false NOT NULL;
ALTER TABLE "supply" ADD COLUMN "is_perishable" boolean DEFAULT false NOT NULL;
ALTER TABLE "supply" ADD COLUMN "expiration_warning_days" integer DEFAULT 3 NOT NULL;
ALTER TABLE "supply" ADD CONSTRAINT "supply_expiration_warning_days_non_negative_check" CHECK ("expiration_warning_days" >= 0);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "timezone" text DEFAULT 'America/Mexico_City' NOT NULL;
--> statement-breakpoint
ALTER TABLE "work_order" ADD COLUMN "inventory_requirements_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "work_order" ADD COLUMN "cancelled_at" timestamp with time zone;
ALTER TABLE "work_order" ADD COLUMN "cancelled_by_user_id" text;
ALTER TABLE "work_order" DROP CONSTRAINT "work_order_status_check";
ALTER TABLE "work_order" DROP CONSTRAINT "work_order_completion_consistency_check";
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_status_check" CHECK ("status" in ('open', 'completed', 'cancelled'));
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_completion_consistency_check" CHECK (("status" = 'open' and "completed_at" is null and "completed_by_user_id" is null and "cancelled_at" is null and "cancelled_by_user_id" is null) or ("status" = 'completed' and "completed_at" is not null and "completed_by_user_id" is not null and "cancelled_at" is null and "cancelled_by_user_id" is null) or ("status" = 'cancelled' and "completed_at" is null and "completed_by_user_id" is null and "cancelled_at" is not null and "cancelled_by_user_id" is not null));
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_cancelled_by_user_id_user_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
CREATE INDEX "work_order_cancelled_by_user_id_idx" ON "work_order" USING btree ("cancelled_by_user_id");
ALTER TABLE "order" ADD COLUMN "cancelled_at" timestamp with time zone;
ALTER TABLE "order" ADD COLUMN "cancelled_by_user_id" text;
ALTER TABLE "order" ADD COLUMN "cancellation_reason" text;
ALTER TABLE "order" ADD CONSTRAINT "order_cancelled_by_user_id_user_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
ALTER TABLE "order" ADD CONSTRAINT "order_cancellation_consistency_check" CHECK (("cancelled_at" is null and "cancelled_by_user_id" is null and "cancellation_reason" is null) or ("cancelled_at" is not null and "cancelled_by_user_id" is not null and nullif(trim("cancellation_reason"), '') is not null));
CREATE INDEX "order_cancelled_by_user_id_idx" ON "order" USING btree ("cancelled_by_user_id");
--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "inventory_tracking_mode" "product_inventory_tracking_mode" DEFAULT 'untracked' NOT NULL;
UPDATE "product" SET "inventory_tracking_mode" = CASE
  WHEN "product_type" = 'assembled' THEN 'recipe'::"product_inventory_tracking_mode"
  WHEN "product_type" = 'compound' THEN 'derived'::"product_inventory_tracking_mode"
  ELSE 'untracked'::"product_inventory_tracking_mode"
END;
ALTER TABLE "product" ADD CONSTRAINT "product_inventory_tracking_mode_type_check" CHECK (("product_type" = 'compound' and "inventory_tracking_mode" = 'derived') or ("product_type" = 'assembled' and "inventory_tracking_mode" in ('recipe', 'finished_good', 'untracked')) or ("product_type" = 'simple' and "inventory_tracking_mode" in ('untracked', 'finished_good')));
CREATE INDEX "product_inventory_tracking_mode_idx" ON "product" USING btree ("inventory_tracking_mode");
--> statement-breakpoint

CREATE TABLE "inventory_item" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" "inventory_item_kind" NOT NULL,
  "ingredient_id" text,
  "supply_id" text,
  "product_id" text,
  "variation_id" text,
  "base_unit_id" text NOT NULL,
  "is_tracked" boolean DEFAULT true NOT NULL,
  "tracks_lots" boolean DEFAULT false NOT NULL,
  "is_perishable" boolean DEFAULT false NOT NULL,
  "expiration_warning_days" integer DEFAULT 3 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_item_exactly_one_source_check" CHECK (num_nonnulls("ingredient_id", "supply_id", "product_id", "variation_id") = 1),
  CONSTRAINT "inventory_item_kind_source_check" CHECK (("kind" = 'ingredient' and "ingredient_id" is not null) or ("kind" = 'supply' and "supply_id" is not null) or ("kind" = 'product' and "product_id" is not null) or ("kind" = 'variation' and "variation_id" is not null)),
  CONSTRAINT "inventory_item_expiration_warning_days_non_negative_check" CHECK ("expiration_warning_days" >= 0)
);
--> statement-breakpoint
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE restrict;
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_supply_id_supply_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supply"("id") ON DELETE restrict;
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict;
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_variation_id_variation_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."variation"("id") ON DELETE restrict;
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_base_unit_id_unit_id_fk" FOREIGN KEY ("base_unit_id") REFERENCES "public"."unit"("id") ON DELETE restrict;
CREATE UNIQUE INDEX "inventory_item_ingredient_unique" ON "inventory_item" USING btree ("ingredient_id") WHERE "ingredient_id" is not null;
CREATE UNIQUE INDEX "inventory_item_supply_unique" ON "inventory_item" USING btree ("supply_id") WHERE "supply_id" is not null;
CREATE UNIQUE INDEX "inventory_item_product_unique" ON "inventory_item" USING btree ("product_id") WHERE "product_id" is not null;
CREATE UNIQUE INDEX "inventory_item_variation_unique" ON "inventory_item" USING btree ("variation_id") WHERE "variation_id" is not null;
CREATE INDEX "inventory_item_base_unit_id_idx" ON "inventory_item" USING btree ("base_unit_id");
--> statement-breakpoint

INSERT INTO "inventory_item" ("id", "kind", "ingredient_id", "base_unit_id", "is_tracked", "tracks_lots", "is_perishable", "expiration_warning_days")
SELECT 'inv_ing_' || "id", 'ingredient', "id", "base_unit_id", "is_inventory_tracked", "tracks_lots", "is_perishable", "expiration_warning_days" FROM "ingredient";
INSERT INTO "inventory_item" ("id", "kind", "supply_id", "base_unit_id", "is_tracked", "tracks_lots", "is_perishable", "expiration_warning_days")
SELECT 'inv_sup_' || "id", 'supply', "id", "base_unit_id", "is_inventory_tracked", "tracks_lots", "is_perishable", "expiration_warning_days" FROM "supply";
INSERT INTO "inventory_item" ("id", "kind", "product_id", "base_unit_id", "is_tracked")
SELECT 'inv_prd_' || p."id", 'product', p."id", p."unit_id", p."inventory_tracking_mode" = 'finished_good' AND NOT EXISTS (SELECT 1 FROM "variation" v WHERE v."product_id" = p."id" AND v."deleted_at" IS NULL) FROM "product" p;
INSERT INTO "inventory_item" ("id", "kind", "variation_id", "base_unit_id", "is_tracked")
SELECT 'inv_var_' || v."id", 'variation', v."id", p."unit_id", p."inventory_tracking_mode" = 'finished_good' FROM "variation" v INNER JOIN "product" p ON p."id" = v."product_id";
--> statement-breakpoint

CREATE TABLE "inventory_location" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "type" "inventory_location_type" NOT NULL,
  "organization_id" text,
  "timezone" text NOT NULL,
  "is_default_sales_location" boolean DEFAULT false NOT NULL,
  "sales_enforcement_enabled" boolean DEFAULT false NOT NULL,
  "activated_at" timestamp with time zone,
  "activated_by_user_id" text,
  "deactivated_at" timestamp with time zone,
  "deactivated_by_user_id" text,
  "deactivation_reason" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "inventory_location_type_organization_check" CHECK (("type" = 'branch' and "organization_id" is not null) or ("type" = 'distribution_center' and "organization_id" is null)),
  CONSTRAINT "inventory_location_default_sales_check" CHECK ("type" = 'branch' or "is_default_sales_location" = false)
);
ALTER TABLE "inventory_location" ADD CONSTRAINT "inventory_location_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict;
ALTER TABLE "inventory_location" ADD CONSTRAINT "inventory_location_activated_by_user_id_user_id_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
ALTER TABLE "inventory_location" ADD CONSTRAINT "inventory_location_deactivated_by_user_id_user_id_fk" FOREIGN KEY ("deactivated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
CREATE UNIQUE INDEX "inventory_location_default_branch_unique" ON "inventory_location" USING btree ("organization_id") WHERE "type" = 'branch' and "is_default_sales_location" = true and "deleted_at" is null;
CREATE INDEX "inventory_location_organization_id_idx" ON "inventory_location" USING btree ("organization_id");
CREATE INDEX "inventory_location_type_idx" ON "inventory_location" USING btree ("type");
INSERT INTO "inventory_location" ("id", "name", "type", "organization_id", "timezone", "is_default_sales_location")
SELECT 'inv_loc_' || "id", "name", 'branch', "id", "timezone", true FROM "organization";
--> statement-breakpoint

CREATE TABLE "inventory_location_access" (
  "location_id" text NOT NULL,
  "user_id" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_location_access_pk" PRIMARY KEY("location_id", "user_id")
);
ALTER TABLE "inventory_location_access" ADD CONSTRAINT "inventory_location_access_location_id_inventory_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_location"("id") ON DELETE cascade;
ALTER TABLE "inventory_location_access" ADD CONSTRAINT "inventory_location_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
CREATE INDEX "inventory_location_access_user_id_idx" ON "inventory_location_access" USING btree ("user_id");
--> statement-breakpoint

CREATE TABLE "inventory_location_item" (
  "location_id" text NOT NULL,
  "inventory_item_id" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "low_stock_threshold" numeric(12, 6),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_location_item_pk" PRIMARY KEY("location_id", "inventory_item_id"),
  CONSTRAINT "inventory_location_item_low_stock_non_negative_check" CHECK ("low_stock_threshold" is null or "low_stock_threshold" >= 0)
);
ALTER TABLE "inventory_location_item" ADD CONSTRAINT "inventory_location_item_location_id_inventory_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_location"("id") ON DELETE cascade;
ALTER TABLE "inventory_location_item" ADD CONSTRAINT "inventory_location_item_inventory_item_id_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict;
CREATE INDEX "inventory_location_item_inventory_item_id_idx" ON "inventory_location_item" USING btree ("inventory_item_id");
--> statement-breakpoint

CREATE TABLE "inventory_lot" (
  "id" text PRIMARY KEY NOT NULL,
  "inventory_item_id" text NOT NULL,
  "lot_code" text,
  "normalized_lot_code" text,
  "internal_batch_key" text NOT NULL,
  "expires_on" date,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "inventory_lot" ADD CONSTRAINT "inventory_lot_inventory_item_id_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict;
CREATE UNIQUE INDEX "inventory_lot_item_code_unique" ON "inventory_lot" USING btree ("inventory_item_id", "normalized_lot_code") WHERE "normalized_lot_code" is not null;
CREATE UNIQUE INDEX "inventory_lot_item_internal_batch_unique" ON "inventory_lot" USING btree ("inventory_item_id", "internal_batch_key");
CREATE INDEX "inventory_lot_item_expiration_idx" ON "inventory_lot" USING btree ("inventory_item_id", "expires_on");
--> statement-breakpoint

CREATE TABLE "inventory_balance" (
  "location_id" text NOT NULL,
  "inventory_item_id" text NOT NULL,
  "lot_id" text NOT NULL,
  "on_hand_quantity" numeric(12, 6) DEFAULT 0 NOT NULL,
  "reserved_quantity" numeric(12, 6) DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_balance_pk" PRIMARY KEY("location_id", "inventory_item_id", "lot_id"),
  CONSTRAINT "inventory_balance_on_hand_non_negative_check" CHECK ("on_hand_quantity" >= 0),
  CONSTRAINT "inventory_balance_reserved_non_negative_check" CHECK ("reserved_quantity" >= 0),
  CONSTRAINT "inventory_balance_on_hand_precision_check" CHECK (scale("on_hand_quantity") <= 6),
  CONSTRAINT "inventory_balance_reserved_precision_check" CHECK (scale("reserved_quantity") <= 6)
);
ALTER TABLE "inventory_balance" ADD CONSTRAINT "inventory_balance_location_id_inventory_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_location"("id") ON DELETE restrict;
ALTER TABLE "inventory_balance" ADD CONSTRAINT "inventory_balance_inventory_item_id_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict;
ALTER TABLE "inventory_balance" ADD CONSTRAINT "inventory_balance_lot_id_inventory_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lot"("id") ON DELETE restrict;
CREATE INDEX "inventory_balance_item_location_idx" ON "inventory_balance" USING btree ("inventory_item_id", "location_id");
--> statement-breakpoint

CREATE TABLE "inventory_adjustment" (
  "id" text PRIMARY KEY NOT NULL,
  "location_id" text NOT NULL,
  "direction" "inventory_adjustment_direction" NOT NULL,
  "reason" "inventory_adjustment_reason" NOT NULL,
  "observations" text,
  "created_by_user_id" text NOT NULL,
  "reversed_at" timestamp with time zone,
  "reversed_by_user_id" text,
  "reversal_adjustment_id" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_adjustment_other_observations_check" CHECK ("reason" <> 'other' or nullif(btrim("observations"), '') is not null)
);
ALTER TABLE "inventory_adjustment" ADD CONSTRAINT "inventory_adjustment_location_id_inventory_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_location"("id") ON DELETE restrict;
ALTER TABLE "inventory_adjustment" ADD CONSTRAINT "inventory_adjustment_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
ALTER TABLE "inventory_adjustment" ADD CONSTRAINT "inventory_adjustment_reversed_by_user_id_user_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
CREATE INDEX "inventory_adjustment_location_created_at_idx" ON "inventory_adjustment" USING btree ("location_id", "created_at");
--> statement-breakpoint

CREATE TABLE "inventory_adjustment_line" (
  "id" text PRIMARY KEY NOT NULL,
  "adjustment_id" text NOT NULL,
  "inventory_item_id" text NOT NULL,
  "lot_id" text NOT NULL,
  "quantity" numeric(12, 6) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_adjustment_line_quantity_positive_check" CHECK ("quantity" > 0),
  CONSTRAINT "inventory_adjustment_line_quantity_precision_check" CHECK (scale("quantity") <= 6)
);
ALTER TABLE "inventory_adjustment_line" ADD CONSTRAINT "inventory_adjustment_line_adjustment_id_inventory_adjustment_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."inventory_adjustment"("id") ON DELETE restrict;
ALTER TABLE "inventory_adjustment_line" ADD CONSTRAINT "inventory_adjustment_line_inventory_item_id_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict;
ALTER TABLE "inventory_adjustment_line" ADD CONSTRAINT "inventory_adjustment_line_lot_id_inventory_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lot"("id") ON DELETE restrict;
CREATE INDEX "inventory_adjustment_line_adjustment_id_idx" ON "inventory_adjustment_line" USING btree ("adjustment_id");
CREATE INDEX "inventory_adjustment_line_item_id_idx" ON "inventory_adjustment_line" USING btree ("inventory_item_id");
--> statement-breakpoint

CREATE TABLE "inventory_reservation" (
  "id" text PRIMARY KEY NOT NULL,
  "location_id" text NOT NULL,
  "kind" "inventory_reservation_kind" NOT NULL,
  "status" "inventory_reservation_status" DEFAULT 'active' NOT NULL,
  "payment_attempt_id" text,
  "order_id" text,
  "requirements_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expires_at" timestamp with time zone,
  "released_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_reservation_source_check" CHECK (("kind" = 'checkout' and "payment_attempt_id" is not null and "expires_at" is not null) or ("kind" = 'order' and "order_id" is not null))
);
ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_location_id_inventory_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_location"("id") ON DELETE restrict;
ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_payment_attempt_id_order_payment_attempt_id_fk" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."order_payment_attempt"("id") ON DELETE restrict;
ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict;
CREATE INDEX "inventory_reservation_status_expires_at_idx" ON "inventory_reservation" USING btree ("status", "expires_at");
CREATE INDEX "inventory_reservation_order_id_idx" ON "inventory_reservation" USING btree ("order_id");
CREATE INDEX "inventory_reservation_payment_attempt_id_idx" ON "inventory_reservation" USING btree ("payment_attempt_id");
--> statement-breakpoint

CREATE TABLE "inventory_reservation_allocation" (
  "id" text PRIMARY KEY NOT NULL,
  "reservation_id" text NOT NULL,
  "inventory_item_id" text NOT NULL,
  "lot_id" text NOT NULL,
  "work_order_id" text,
  "reserved_quantity" numeric(12, 6) NOT NULL,
  "consumed_quantity" numeric(12, 6) DEFAULT 0 NOT NULL,
  "released_quantity" numeric(12, 6) DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_reservation_allocation_quantities_check" CHECK ("reserved_quantity" > 0 and "consumed_quantity" >= 0 and "released_quantity" >= 0 and "consumed_quantity" + "released_quantity" <= "reserved_quantity")
);
ALTER TABLE "inventory_reservation_allocation" ADD CONSTRAINT "inventory_reservation_allocation_reservation_id_inventory_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."inventory_reservation"("id") ON DELETE restrict;
ALTER TABLE "inventory_reservation_allocation" ADD CONSTRAINT "inventory_reservation_allocation_inventory_item_id_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict;
ALTER TABLE "inventory_reservation_allocation" ADD CONSTRAINT "inventory_reservation_allocation_lot_id_inventory_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lot"("id") ON DELETE restrict;
ALTER TABLE "inventory_reservation_allocation" ADD CONSTRAINT "inventory_reservation_allocation_work_order_id_work_order_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_order"("id") ON DELETE restrict;
CREATE INDEX "inventory_reservation_allocation_reservation_id_idx" ON "inventory_reservation_allocation" USING btree ("reservation_id");
CREATE INDEX "inventory_reservation_allocation_work_order_id_idx" ON "inventory_reservation_allocation" USING btree ("work_order_id");
--> statement-breakpoint

CREATE TABLE "inventory_movement" (
  "id" text PRIMARY KEY NOT NULL,
  "location_id" text NOT NULL,
  "type" "inventory_movement_type" NOT NULL,
  "adjustment_id" text,
  "reservation_id" text,
  "order_id" text,
  "work_order_id" text,
  "actor_user_id" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_location_id_inventory_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_location"("id") ON DELETE restrict;
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_adjustment_id_inventory_adjustment_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."inventory_adjustment"("id") ON DELETE restrict;
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_reservation_id_inventory_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."inventory_reservation"("id") ON DELETE restrict;
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict;
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_work_order_id_work_order_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_order"("id") ON DELETE restrict;
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
CREATE INDEX "inventory_movement_location_created_at_idx" ON "inventory_movement" USING btree ("location_id", "created_at");
CREATE INDEX "inventory_movement_adjustment_id_idx" ON "inventory_movement" USING btree ("adjustment_id");
CREATE INDEX "inventory_movement_order_id_idx" ON "inventory_movement" USING btree ("order_id");
--> statement-breakpoint

CREATE TABLE "inventory_movement_line" (
  "id" text PRIMARY KEY NOT NULL,
  "movement_id" text NOT NULL,
  "inventory_item_id" text NOT NULL,
  "lot_id" text NOT NULL,
  "on_hand_delta" numeric(12, 6) DEFAULT 0 NOT NULL,
  "reserved_delta" numeric(12, 6) DEFAULT 0 NOT NULL,
  "on_hand_after" numeric(12, 6) NOT NULL,
  "reserved_after" numeric(12, 6) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_movement_line_non_zero_check" CHECK ("on_hand_delta" <> 0 or "reserved_delta" <> 0)
);
ALTER TABLE "inventory_movement_line" ADD CONSTRAINT "inventory_movement_line_movement_id_inventory_movement_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movement"("id") ON DELETE restrict;
ALTER TABLE "inventory_movement_line" ADD CONSTRAINT "inventory_movement_line_inventory_item_id_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict;
ALTER TABLE "inventory_movement_line" ADD CONSTRAINT "inventory_movement_line_lot_id_inventory_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lot"("id") ON DELETE restrict;
CREATE INDEX "inventory_movement_line_movement_id_idx" ON "inventory_movement_line" USING btree ("movement_id");
CREATE INDEX "inventory_movement_line_item_id_idx" ON "inventory_movement_line" USING btree ("inventory_item_id");
--> statement-breakpoint

CREATE TABLE "inventory_availability_override" (
  "id" text PRIMARY KEY NOT NULL,
  "location_id" text NOT NULL,
  "target_type" "inventory_override_target_type" NOT NULL,
  "product_id" text,
  "variation_id" text,
  "modifier_option_id" text,
  "reason" text NOT NULL,
  "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ends_at" timestamp with time zone,
  "created_by_user_id" text NOT NULL,
  "cleared_at" timestamp with time zone,
  "cleared_by_user_id" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inventory_availability_override_exactly_one_target_check" CHECK (num_nonnulls("product_id", "variation_id", "modifier_option_id") = 1),
  CONSTRAINT "inventory_availability_override_target_type_check" CHECK (("target_type" = 'product' and "product_id" is not null) or ("target_type" = 'variation' and "variation_id" is not null) or ("target_type" = 'modifier_option' and "modifier_option_id" is not null)),
  CONSTRAINT "inventory_availability_override_interval_check" CHECK ("ends_at" is null or "ends_at" > "starts_at")
);
ALTER TABLE "inventory_availability_override" ADD CONSTRAINT "inventory_availability_override_location_id_inventory_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_location"("id") ON DELETE restrict;
ALTER TABLE "inventory_availability_override" ADD CONSTRAINT "inventory_availability_override_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict;
ALTER TABLE "inventory_availability_override" ADD CONSTRAINT "inventory_availability_override_variation_id_variation_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."variation"("id") ON DELETE restrict;
ALTER TABLE "inventory_availability_override" ADD CONSTRAINT "inventory_availability_override_modifier_option_id_modifier_option_id_fk" FOREIGN KEY ("modifier_option_id") REFERENCES "public"."modifier_option"("id") ON DELETE restrict;
ALTER TABLE "inventory_availability_override" ADD CONSTRAINT "inventory_availability_override_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
ALTER TABLE "inventory_availability_override" ADD CONSTRAINT "inventory_availability_override_cleared_by_user_id_user_id_fk" FOREIGN KEY ("cleared_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
CREATE INDEX "inventory_availability_override_location_active_idx" ON "inventory_availability_override" USING btree ("location_id", "cleared_at", "ends_at");
