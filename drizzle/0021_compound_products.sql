CREATE TABLE IF NOT EXISTS "product_compound_component" (
  "compound_product_id" text NOT NULL REFERENCES "product" ("id") ON DELETE cascade,
  "component_product_id" text NOT NULL REFERENCES "product" ("id") ON DELETE restrict,
  "quantity" integer NOT NULL DEFAULT 1,
  "sort_order" integer NOT NULL,
  "label" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "product_compound_component_pk" PRIMARY KEY ("compound_product_id", "sort_order"),
  CONSTRAINT "product_compound_component_quantity_positive_check" CHECK ("quantity" > 0),
  CONSTRAINT "product_compound_component_sort_order_non_negative_check" CHECK ("sort_order" >= 0),
  CONSTRAINT "product_compound_component_no_self_reference_check" CHECK ("compound_product_id" <> "component_product_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_compound_component_product_component_sort_unique"
  ON "product_compound_component" ("compound_product_id", "component_product_id", "sort_order");

CREATE INDEX IF NOT EXISTS "product_compound_component_compound_product_id_idx"
  ON "product_compound_component" ("compound_product_id");

CREATE INDEX IF NOT EXISTS "product_compound_component_component_product_id_idx"
  ON "product_compound_component" ("component_product_id");

CREATE TABLE IF NOT EXISTS "order_item_compound_component" (
  "id" text PRIMARY KEY,
  "order_item_id" text NOT NULL REFERENCES "order_item" ("id") ON DELETE cascade,
  "compound_product_id" text NOT NULL REFERENCES "product" ("id") ON DELETE restrict,
  "component_product_id" text NOT NULL REFERENCES "product" ("id") ON DELETE restrict,
  "variation_id" text REFERENCES "variation" ("id") ON DELETE restrict,
  "component_label" text,
  "product_name" text NOT NULL,
  "product_kitchen_name" text,
  "variation_name" text,
  "variation_selections_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "modifiers_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "quantity" integer NOT NULL DEFAULT 1,
  "modifiers_subtotal_cents" integer NOT NULL DEFAULT 0,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "order_item_compound_component_quantity_positive_check" CHECK ("quantity" > 0),
  CONSTRAINT "order_item_compound_component_modifiers_subtotal_non_negative_check" CHECK ("modifiers_subtotal_cents" >= 0),
  CONSTRAINT "order_item_compound_component_sort_order_non_negative_check" CHECK ("sort_order" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "order_item_compound_component_item_sort_order_unique"
  ON "order_item_compound_component" ("order_item_id", "sort_order");

CREATE INDEX IF NOT EXISTS "order_item_compound_component_order_item_id_idx"
  ON "order_item_compound_component" ("order_item_id");

CREATE INDEX IF NOT EXISTS "order_item_compound_component_compound_product_id_idx"
  ON "order_item_compound_component" ("compound_product_id");

CREATE INDEX IF NOT EXISTS "order_item_compound_component_component_product_id_idx"
  ON "order_item_compound_component" ("component_product_id");

CREATE INDEX IF NOT EXISTS "order_item_compound_component_variation_id_idx"
  ON "order_item_compound_component" ("variation_id");
