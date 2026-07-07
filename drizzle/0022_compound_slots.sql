CREATE TABLE IF NOT EXISTS "product_compound_slot" (
  "id" text PRIMARY KEY NOT NULL,
  "compound_product_id" text NOT NULL REFERENCES "product" ("id") ON DELETE cascade,
  "label" text NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "sort_order" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "product_compound_slot_quantity_positive_check" CHECK ("quantity" > 0),
  CONSTRAINT "product_compound_slot_sort_order_non_negative_check" CHECK ("sort_order" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_compound_slot_product_sort_unique"
  ON "product_compound_slot" ("compound_product_id", "sort_order");

CREATE INDEX IF NOT EXISTS "product_compound_slot_compound_product_id_idx"
  ON "product_compound_slot" ("compound_product_id");

CREATE TABLE IF NOT EXISTS "product_compound_slot_option" (
  "id" text PRIMARY KEY NOT NULL,
  "slot_id" text NOT NULL REFERENCES "product_compound_slot" ("id") ON DELETE cascade,
  "component_product_id" text NOT NULL REFERENCES "product" ("id") ON DELETE restrict,
  "label" text,
  "sort_order" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "product_compound_slot_option_sort_order_non_negative_check" CHECK ("sort_order" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_compound_slot_option_slot_sort_unique"
  ON "product_compound_slot_option" ("slot_id", "sort_order");

CREATE UNIQUE INDEX IF NOT EXISTS "product_compound_slot_option_slot_product_unique"
  ON "product_compound_slot_option" ("slot_id", "component_product_id");

CREATE INDEX IF NOT EXISTS "product_compound_slot_option_slot_id_idx"
  ON "product_compound_slot_option" ("slot_id");

CREATE INDEX IF NOT EXISTS "product_compound_slot_option_component_product_id_idx"
  ON "product_compound_slot_option" ("component_product_id");

ALTER TABLE "order_item_compound_component"
  ADD COLUMN IF NOT EXISTS "slot_id" text,
  ADD COLUMN IF NOT EXISTS "slot_option_id" text,
  ADD COLUMN IF NOT EXISTS "slot_label" text;
