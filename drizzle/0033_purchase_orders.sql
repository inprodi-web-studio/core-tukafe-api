CREATE TYPE "public"."purchase_order_status" AS ENUM('draft', 'issued', 'partially_received', 'received', 'cancelled', 'closed');
--> statement-breakpoint
CREATE TYPE "public"."purchase_receipt_status" AS ENUM('applied', 'reversed');
--> statement-breakpoint
CREATE TYPE "public"."purchase_order_event_type" AS ENUM('created', 'updated', 'issued', 'metadata_updated', 'cancelled', 'closed', 'duplicated', 'receipt_applied', 'receipt_reversed', 'receipt_corrected');
--> statement-breakpoint
ALTER TYPE "public"."inventory_movement_type" ADD VALUE 'purchase_receipt';
--> statement-breakpoint
ALTER TYPE "public"."inventory_movement_type" ADD VALUE 'purchase_receipt_reversal';
--> statement-breakpoint

CREATE TABLE "purchase_order_folio_counter" (
  "year" integer PRIMARY KEY NOT NULL,
  "last_sequence" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "purchase_order" (
  "id" text PRIMARY KEY NOT NULL,
  "folio" text NOT NULL,
  "folio_year" integer NOT NULL,
  "folio_sequence" integer NOT NULL,
  "supplier_id" text NOT NULL,
  "location_id" text NOT NULL,
  "status" "purchase_order_status" DEFAULT 'draft' NOT NULL,
  "currency" text DEFAULT 'MXN' NOT NULL,
  "supplier_name_snapshot" text NOT NULL,
  "location_name_snapshot" text NOT NULL,
  "location_timezone_snapshot" text NOT NULL,
  "quote_reference" text,
  "observations" text,
  "expected_delivery_on" date,
  "subtotal_cents" integer DEFAULT 0 NOT NULL,
  "tax_cents" integer DEFAULT 0 NOT NULL,
  "total_cents" integer DEFAULT 0 NOT NULL,
  "created_by_user_id" text NOT NULL,
  "issued_at" timestamp with time zone,
  "issued_by_user_id" text,
  "cancelled_at" timestamp with time zone,
  "cancelled_by_user_id" text,
  "cancellation_reason" text,
  "closed_at" timestamp with time zone,
  "closed_by_user_id" text,
  "close_reason" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "purchase_order_currency_mxn_check" CHECK ("currency" = 'MXN'),
  CONSTRAINT "purchase_order_totals_non_negative_check" CHECK ("subtotal_cents" >= 0 and "tax_cents" >= 0 and "total_cents" >= 0 and "total_cents" = "subtotal_cents" + "tax_cents"),
  CONSTRAINT "purchase_order_issue_consistency_check" CHECK (("status" = 'draft' and "issued_at" is null and "issued_by_user_id" is null) or ("status" <> 'draft' and "issued_at" is not null and "issued_by_user_id" is not null)),
  CONSTRAINT "purchase_order_cancel_consistency_check" CHECK (("status" = 'cancelled' and "cancelled_at" is not null and "cancelled_by_user_id" is not null and nullif(btrim("cancellation_reason"), '') is not null) or ("status" <> 'cancelled' and "cancelled_at" is null and "cancelled_by_user_id" is null and "cancellation_reason" is null)),
  CONSTRAINT "purchase_order_close_consistency_check" CHECK (("status" = 'closed' and "closed_at" is not null and "closed_by_user_id" is not null and nullif(btrim("close_reason"), '') is not null) or ("status" <> 'closed' and "closed_at" is null and "closed_by_user_id" is null and "close_reason" is null))
);
--> statement-breakpoint

CREATE TABLE "purchase_order_item" (
  "id" text PRIMARY KEY NOT NULL,
  "purchase_order_id" text NOT NULL,
  "supplier_item_id" text NOT NULL,
  "presentation_id" text NOT NULL,
  "inventory_item_id" text,
  "is_tracked_snapshot" boolean NOT NULL,
  "tracks_lots_snapshot" boolean NOT NULL,
  "is_perishable_snapshot" boolean NOT NULL,
  "item_type" text NOT NULL,
  "item_name_snapshot" text NOT NULL,
  "presentation_name_snapshot" text NOT NULL,
  "base_unit_id" text NOT NULL,
  "base_unit_name_snapshot" text NOT NULL,
  "base_unit_abbreviation_snapshot" text NOT NULL,
  "base_unit_precision_snapshot" integer NOT NULL,
  "content_quantity_snapshot" numeric(14, 6) NOT NULL,
  "ordered_presentation_quantity" numeric(14, 6) NOT NULL,
  "received_presentation_quantity" numeric(14, 6) DEFAULT 0 NOT NULL,
  "unit_price_cents" integer NOT NULL,
  "subtotal_cents" integer NOT NULL,
  "tax_cents" integer NOT NULL,
  "total_cents" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "purchase_order_item_type_check" CHECK ("item_type" in ('ingredient', 'supply')),
  CONSTRAINT "purchase_order_item_quantity_positive_check" CHECK ("ordered_presentation_quantity" > 0 and "received_presentation_quantity" >= 0 and "received_presentation_quantity" <= "ordered_presentation_quantity"),
  CONSTRAINT "purchase_order_item_quantity_precision_check" CHECK (scale("ordered_presentation_quantity") <= 6 and scale("received_presentation_quantity") <= 6),
  CONSTRAINT "purchase_order_item_content_positive_check" CHECK ("content_quantity_snapshot" > 0),
  CONSTRAINT "purchase_order_item_money_check" CHECK ("unit_price_cents" >= 0 and "subtotal_cents" >= 0 and "tax_cents" >= 0 and "total_cents" = "subtotal_cents" + "tax_cents"),
  CONSTRAINT "purchase_order_item_base_precision_check" CHECK ("base_unit_precision_snapshot" between 0 and 6)
);
--> statement-breakpoint

CREATE TABLE "purchase_order_item_tax" (
  "purchase_order_item_id" text NOT NULL,
  "tax_id" text NOT NULL,
  "tax_name_snapshot" text NOT NULL,
  "tax_rate_bps_snapshot" integer NOT NULL,
  "tax_amount_cents" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "purchase_order_item_tax_pk" PRIMARY KEY("purchase_order_item_id", "tax_id"),
  CONSTRAINT "purchase_order_item_tax_rate_check" CHECK ("tax_rate_bps_snapshot" between 0 and 10000 and "tax_amount_cents" >= 0)
);
--> statement-breakpoint

CREATE TABLE "purchase_receipt" (
  "id" text PRIMARY KEY NOT NULL,
  "purchase_order_id" text NOT NULL,
  "sequence" integer NOT NULL,
  "folio" text NOT NULL,
  "status" "purchase_receipt_status" DEFAULT 'applied' NOT NULL,
  "received_on" date NOT NULL,
  "supplier_document_reference" text,
  "observations" text,
  "inventory_movement_id" text,
  "corrects_receipt_id" text,
  "replacement_receipt_id" text,
  "received_by_user_id" text NOT NULL,
  "reversed_at" timestamp with time zone,
  "reversed_by_user_id" text,
  "reversal_reason" text,
  "reversal_inventory_movement_id" text,
  "subtotal_cents" integer DEFAULT 0 NOT NULL,
  "tax_cents" integer DEFAULT 0 NOT NULL,
  "total_cents" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "purchase_receipt_sequence_positive_check" CHECK ("sequence" > 0),
  CONSTRAINT "purchase_receipt_totals_non_negative_check" CHECK ("subtotal_cents" >= 0 and "tax_cents" >= 0 and "total_cents" = "subtotal_cents" + "tax_cents"),
  CONSTRAINT "purchase_receipt_reversal_consistency_check" CHECK (("status" = 'applied' and "reversed_at" is null and "reversed_by_user_id" is null and "reversal_reason" is null and "reversal_inventory_movement_id" is null) or ("status" = 'reversed' and "reversed_at" is not null and "reversed_by_user_id" is not null and nullif(btrim("reversal_reason"), '') is not null))
);
--> statement-breakpoint

CREATE TABLE "purchase_receipt_allocation" (
  "id" text PRIMARY KEY NOT NULL,
  "receipt_id" text NOT NULL,
  "purchase_order_item_id" text NOT NULL,
  "inventory_item_id" text,
  "lot_id" text,
  "presentation_quantity" numeric(14, 6) NOT NULL,
  "base_quantity" numeric(14, 6) NOT NULL,
  "lot_code_snapshot" text,
  "expires_on_snapshot" date,
  "unit_price_cents_snapshot" integer NOT NULL,
  "content_quantity_snapshot" numeric(14, 6) NOT NULL,
  "base_unit_cost" numeric(18, 8) NOT NULL,
  "subtotal_cents" integer NOT NULL,
  "tax_cents" integer NOT NULL,
  "total_cents" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "purchase_receipt_allocation_quantity_positive_check" CHECK ("presentation_quantity" > 0 and "base_quantity" > 0),
  CONSTRAINT "purchase_receipt_allocation_quantity_precision_check" CHECK (scale("presentation_quantity") <= 6 and scale("base_quantity") <= 6),
  CONSTRAINT "purchase_receipt_allocation_money_check" CHECK ("unit_price_cents_snapshot" >= 0 and "base_unit_cost" >= 0 and "subtotal_cents" >= 0 and "tax_cents" >= 0 and "total_cents" = "subtotal_cents" + "tax_cents"),
  CONSTRAINT "purchase_receipt_allocation_inventory_pair_check" CHECK (("inventory_item_id" is null and "lot_id" is null) or ("inventory_item_id" is not null and "lot_id" is not null))
);
--> statement-breakpoint

CREATE TABLE "purchase_order_event" (
  "id" text PRIMARY KEY NOT NULL,
  "purchase_order_id" text NOT NULL,
  "type" "purchase_order_event_type" NOT NULL,
  "actor_user_id" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "inventory_movement" ADD COLUMN "purchase_receipt_id" text;
--> statement-breakpoint

ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict;
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_location_id_inventory_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_location"("id") ON DELETE restrict;
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_issued_by_user_id_user_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_cancelled_by_user_id_user_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_closed_by_user_id_user_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE cascade;
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_supplier_item_id_fk" FOREIGN KEY ("supplier_item_id") REFERENCES "public"."supplier_item"("id") ON DELETE restrict;
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_presentation_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."supplier_item_presentation"("id") ON DELETE restrict;
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict;
ALTER TABLE "purchase_order_item" ADD CONSTRAINT "purchase_order_item_base_unit_id_fk" FOREIGN KEY ("base_unit_id") REFERENCES "public"."unit"("id") ON DELETE restrict;
ALTER TABLE "purchase_order_item_tax" ADD CONSTRAINT "purchase_order_item_tax_item_id_fk" FOREIGN KEY ("purchase_order_item_id") REFERENCES "public"."purchase_order_item"("id") ON DELETE cascade;
ALTER TABLE "purchase_order_item_tax" ADD CONSTRAINT "purchase_order_item_tax_tax_id_fk" FOREIGN KEY ("tax_id") REFERENCES "public"."tax"("id") ON DELETE restrict;
ALTER TABLE "purchase_receipt" ADD CONSTRAINT "purchase_receipt_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE restrict;
ALTER TABLE "purchase_receipt" ADD CONSTRAINT "purchase_receipt_inventory_movement_id_fk" FOREIGN KEY ("inventory_movement_id") REFERENCES "public"."inventory_movement"("id") ON DELETE restrict;
ALTER TABLE "purchase_receipt" ADD CONSTRAINT "purchase_receipt_corrects_receipt_id_fk" FOREIGN KEY ("corrects_receipt_id") REFERENCES "public"."purchase_receipt"("id") ON DELETE restrict;
ALTER TABLE "purchase_receipt" ADD CONSTRAINT "purchase_receipt_replacement_receipt_id_fk" FOREIGN KEY ("replacement_receipt_id") REFERENCES "public"."purchase_receipt"("id") ON DELETE restrict;
ALTER TABLE "purchase_receipt" ADD CONSTRAINT "purchase_receipt_received_by_user_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
ALTER TABLE "purchase_receipt" ADD CONSTRAINT "purchase_receipt_reversed_by_user_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
ALTER TABLE "purchase_receipt" ADD CONSTRAINT "purchase_receipt_reversal_movement_id_fk" FOREIGN KEY ("reversal_inventory_movement_id") REFERENCES "public"."inventory_movement"("id") ON DELETE restrict;
ALTER TABLE "purchase_receipt_allocation" ADD CONSTRAINT "purchase_receipt_allocation_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."purchase_receipt"("id") ON DELETE restrict;
ALTER TABLE "purchase_receipt_allocation" ADD CONSTRAINT "purchase_receipt_allocation_order_item_id_fk" FOREIGN KEY ("purchase_order_item_id") REFERENCES "public"."purchase_order_item"("id") ON DELETE restrict;
ALTER TABLE "purchase_receipt_allocation" ADD CONSTRAINT "purchase_receipt_allocation_inventory_item_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_item"("id") ON DELETE restrict;
ALTER TABLE "purchase_receipt_allocation" ADD CONSTRAINT "purchase_receipt_allocation_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."inventory_lot"("id") ON DELETE restrict;
ALTER TABLE "purchase_order_event" ADD CONSTRAINT "purchase_order_event_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE cascade;
ALTER TABLE "purchase_order_event" ADD CONSTRAINT "purchase_order_event_actor_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict;
ALTER TABLE "inventory_movement" ADD CONSTRAINT "inventory_movement_purchase_receipt_id_fk" FOREIGN KEY ("purchase_receipt_id") REFERENCES "public"."purchase_receipt"("id") ON DELETE restrict;
--> statement-breakpoint

CREATE UNIQUE INDEX "purchase_order_folio_unique" ON "purchase_order" ("folio");
CREATE UNIQUE INDEX "purchase_order_year_sequence_unique" ON "purchase_order" ("folio_year", "folio_sequence");
CREATE INDEX "purchase_order_supplier_id_idx" ON "purchase_order" ("supplier_id");
CREATE INDEX "purchase_order_location_status_idx" ON "purchase_order" ("location_id", "status");
CREATE INDEX "purchase_order_created_at_idx" ON "purchase_order" ("created_at");
CREATE INDEX "purchase_order_expected_delivery_on_idx" ON "purchase_order" ("expected_delivery_on");
CREATE UNIQUE INDEX "purchase_order_item_presentation_unique" ON "purchase_order_item" ("purchase_order_id", "presentation_id");
CREATE INDEX "purchase_order_item_order_sort_idx" ON "purchase_order_item" ("purchase_order_id", "sort_order");
CREATE INDEX "purchase_order_item_inventory_item_id_idx" ON "purchase_order_item" ("inventory_item_id");
CREATE INDEX "purchase_order_item_tax_tax_id_idx" ON "purchase_order_item_tax" ("tax_id");
CREATE UNIQUE INDEX "purchase_receipt_folio_unique" ON "purchase_receipt" ("folio");
CREATE UNIQUE INDEX "purchase_receipt_order_sequence_unique" ON "purchase_receipt" ("purchase_order_id", "sequence");
CREATE INDEX "purchase_receipt_order_created_at_idx" ON "purchase_receipt" ("purchase_order_id", "created_at");
CREATE INDEX "purchase_receipt_received_on_idx" ON "purchase_receipt" ("received_on");
CREATE INDEX "purchase_receipt_allocation_receipt_id_idx" ON "purchase_receipt_allocation" ("receipt_id");
CREATE INDEX "purchase_receipt_allocation_order_item_id_idx" ON "purchase_receipt_allocation" ("purchase_order_item_id");
CREATE INDEX "purchase_receipt_allocation_inventory_item_id_idx" ON "purchase_receipt_allocation" ("inventory_item_id");
CREATE INDEX "purchase_order_event_order_created_at_idx" ON "purchase_order_event" ("purchase_order_id", "created_at");
CREATE INDEX "inventory_movement_purchase_receipt_id_idx" ON "inventory_movement" ("purchase_receipt_id");
