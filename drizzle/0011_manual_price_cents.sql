DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'product_type'
  ) THEN
    CREATE TYPE "public"."product_type" AS ENUM ('simple', 'assembled', 'compound');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'upload_visibility'
  ) THEN
    CREATE TYPE "public"."upload_visibility" AS ENUM ('PUBLIC', 'PRIVATE');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'upload_entity_type'
  ) THEN
    CREATE TYPE "public"."upload_entity_type" AS ENUM ('product', 'organization', 'customer', 'user');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'upload_entity_type' AND e.enumlabel = 'ingredient'
  ) THEN
    ALTER TYPE "public"."upload_entity_type" ADD VALUE 'ingredient';
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'upload_entity_type' AND e.enumlabel = 'supply'
  ) THEN
    ALTER TYPE "public"."upload_entity_type" ADD VALUE 'supply';
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'upload_entity_type' AND e.enumlabel = 'variation'
  ) THEN
    ALTER TYPE "public"."upload_entity_type" ADD VALUE 'variation';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."products" RENAME TO "product";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_categories" RENAME TO "product_category";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."units" RENAME TO "unit";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."uploads" RENAME TO "upload";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."upload_references" RENAME TO "upload_reference";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."organization_schedules" RENAME TO "organization_schedule";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."customer_groups" RENAME TO "customer_group";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'organization_schedule'
      AND c.conname = 'organization_schedules_pk'
  ) THEN
    ALTER TABLE "public"."organization_schedule"
      RENAME CONSTRAINT "organization_schedules_pk" TO "organization_schedule_pk";
  END IF;
END $$;
--> statement-breakpoint
DROP INDEX IF EXISTS "organization_schedules_day_of_week_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_schedule_day_of_week_idx" ON "organization_schedule" USING btree ("day_of_week");
--> statement-breakpoint
DROP INDEX IF EXISTS "customer_groups_name_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_group_name_unique" ON "customer_group" USING btree ("name");
--> statement-breakpoint
DROP TABLE IF EXISTS "organization_products" CASCADE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product'
      AND column_name = 'price'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product'
      AND column_name = 'price_cents'
  ) THEN
    ALTER TABLE "public"."product" RENAME COLUMN "price" TO "price_cents";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product'
      AND column_name = 'price_cents'
      AND data_type = 'numeric'
  ) THEN
    ALTER TABLE "public"."product"
      ALTER COLUMN "price_cents" TYPE integer USING ("price_cents" * 100)::integer;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product" DROP COLUMN IF EXISTS "image";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product" DROP CONSTRAINT IF EXISTS "products_price_non_negative_check";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product" DROP CONSTRAINT IF EXISTS "product_price_cents_non_negative_check";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product" DROP CONSTRAINT IF EXISTS "products_unit_id_units_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product" DROP CONSTRAINT IF EXISTS "products_category_id_product_categories_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product" DROP CONSTRAINT IF EXISTS "product_unit_id_unit_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product" DROP CONSTRAINT IF EXISTS "product_category_id_product_category_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product"
  ADD CONSTRAINT "product_price_cents_non_negative_check" CHECK ("price_cents" >= 0);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product"
  ADD CONSTRAINT "product_unit_id_unit_id_fk"
  FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product"
  ADD CONSTRAINT "product_category_id_product_category_id_fk"
  FOREIGN KEY ("category_id") REFERENCES "public"."product_category"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
DROP INDEX IF EXISTS "products_name_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "products_unit_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "products_category_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "products_product_type_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_name_idx" ON "product" USING btree ("name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_unit_id_idx" ON "product" USING btree ("unit_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_category_id_idx" ON "product" USING btree ("category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_product_type_idx" ON "product" USING btree ("product_type");
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_category" ADD COLUMN IF NOT EXISTS "parent_id" text;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_category" DROP CONSTRAINT IF EXISTS "product_categories_color_hex_check";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_category" DROP CONSTRAINT IF EXISTS "product_category_color_hex_check";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_category" DROP CONSTRAINT IF EXISTS "product_categories_parent_id_product_categories_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_category" DROP CONSTRAINT IF EXISTS "product_category_parent_id_product_category_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_category" DROP CONSTRAINT IF EXISTS "product_category_parent_not_self_check";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_category"
  ADD CONSTRAINT "product_category_parent_id_product_category_id_fk"
  FOREIGN KEY ("parent_id") REFERENCES "public"."product_category"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_category"
  ADD CONSTRAINT "product_category_color_hex_check" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$');
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_category"
  ADD CONSTRAINT "product_category_parent_not_self_check"
  CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
--> statement-breakpoint
DROP INDEX IF EXISTS "product_categories_name_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "product_category_name_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_category_parent_name_unique"
  ON "product_category" USING btree ("parent_id", "name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_category_root_name_unique"
  ON "product_category" USING btree ("name")
  WHERE "parent_id" IS NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "product_categories_parent_id_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_category_parent_id_idx" ON "product_category" USING btree ("parent_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "units_name_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "units_abbreviation_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unit_name_unique" ON "unit" USING btree ("name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unit_abbreviation_unique" ON "unit" USING btree ("abbreviation");
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."unit" DROP CONSTRAINT IF EXISTS "units_precision_non_negative_check";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."unit" DROP CONSTRAINT IF EXISTS "unit_precision_non_negative_check";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."unit"
  ADD CONSTRAINT "unit_precision_non_negative_check" CHECK ("precision" >= 0);
--> statement-breakpoint
DROP INDEX IF EXISTS "uploads_visibility_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_visibility_idx" ON "upload" USING btree ("visibility");
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."upload_reference" DROP CONSTRAINT IF EXISTS "upload_references_pk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."upload_reference" DROP CONSTRAINT IF EXISTS "upload_reference_pk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."upload_reference"
  ADD CONSTRAINT "upload_reference_pk" PRIMARY KEY ("upload_id", "entity_type", "entity_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "upload_references_upload_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "upload_references_entity_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_reference_upload_id_idx" ON "upload_reference" USING btree ("upload_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_reference_entity_idx" ON "upload_reference" USING btree ("entity_type", "entity_id");
--> statement-breakpoint
-- moved to 0012_hot_marrow.sql to avoid enum-in-transaction limitations
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingredient_category" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "color" text NOT NULL,
  "icon" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ingredient_category_color_hex_check" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_category_name_unique" ON "ingredient_category" USING btree ("name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingredient" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "unit_id" text NOT NULL,
  "category_id" text NOT NULL,
  "base_cost" integer NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ingredient_base_cost_non_negative_check" CHECK ("base_cost" >= 0)
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."ingredient" DROP CONSTRAINT IF EXISTS "ingredient_unit_id_unit_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."ingredient" DROP CONSTRAINT IF EXISTS "ingredient_category_id_ingredient_category_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."ingredient"
  ADD CONSTRAINT "ingredient_unit_id_unit_id_fk"
  FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."ingredient"
  ADD CONSTRAINT "ingredient_category_id_ingredient_category_id_fk"
  FOREIGN KEY ("category_id") REFERENCES "public"."ingredient_category"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ingredient_name_idx" ON "ingredient" USING btree ("name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ingredient_unit_id_idx" ON "ingredient" USING btree ("unit_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ingredient_category_id_idx" ON "ingredient" USING btree ("category_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supply_category" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "icon" text NOT NULL,
  "color" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "supply_category_color_hex_check" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supply_category_name_unique" ON "supply_category" USING btree ("name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supply" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "base_cost" integer NOT NULL,
  "unit_id" text NOT NULL,
  "category_id" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "supply_base_cost_non_negative_check" CHECK ("base_cost" >= 0)
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."supply" DROP CONSTRAINT IF EXISTS "supply_unit_id_unit_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."supply" DROP CONSTRAINT IF EXISTS "supply_category_id_supply_category_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."supply"
  ADD CONSTRAINT "supply_unit_id_unit_id_fk"
  FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."supply"
  ADD CONSTRAINT "supply_category_id_supply_category_id_fk"
  FOREIGN KEY ("category_id") REFERENCES "public"."supply_category"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supply_name_idx" ON "supply" USING btree ("name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supply_unit_id_idx" ON "supply" USING btree ("unit_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supply_category_id_idx" ON "supply" USING btree ("category_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tax" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "rate" integer NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "tax_rate_bps_range_check" CHECK ("rate" >= 0 AND "rate" <= 10000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tax_name_unique" ON "tax" USING btree ("name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_tax" (
  "product_id" text NOT NULL,
  "tax_id" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "product_tax_pk" PRIMARY KEY ("product_id", "tax_id")
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_tax" DROP CONSTRAINT IF EXISTS "product_tax_product_id_product_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_tax" DROP CONSTRAINT IF EXISTS "product_tax_tax_id_tax_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_tax"
  ADD CONSTRAINT "product_tax_product_id_product_id_fk"
  FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_tax"
  ADD CONSTRAINT "product_tax_tax_id_tax_id_fk"
  FOREIGN KEY ("tax_id") REFERENCES "public"."tax"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_tax_product_id_idx" ON "product_tax" USING btree ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_tax_tax_id_idx" ON "product_tax" USING btree ("tax_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingredient_tax" (
  "ingredient_id" text NOT NULL,
  "tax_id" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ingredient_tax_pk" PRIMARY KEY ("ingredient_id", "tax_id")
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."ingredient_tax" DROP CONSTRAINT IF EXISTS "ingredient_tax_ingredient_id_ingredient_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."ingredient_tax" DROP CONSTRAINT IF EXISTS "ingredient_tax_tax_id_tax_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."ingredient_tax"
  ADD CONSTRAINT "ingredient_tax_ingredient_id_ingredient_id_fk"
  FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."ingredient_tax"
  ADD CONSTRAINT "ingredient_tax_tax_id_tax_id_fk"
  FOREIGN KEY ("tax_id") REFERENCES "public"."tax"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ingredient_tax_ingredient_id_idx" ON "ingredient_tax" USING btree ("ingredient_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ingredient_tax_tax_id_idx" ON "ingredient_tax" USING btree ("tax_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supply_tax" (
  "supply_id" text NOT NULL,
  "tax_id" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "supply_tax_pk" PRIMARY KEY ("supply_id", "tax_id")
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."supply_tax" DROP CONSTRAINT IF EXISTS "supply_tax_supply_id_supply_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."supply_tax" DROP CONSTRAINT IF EXISTS "supply_tax_tax_id_tax_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."supply_tax"
  ADD CONSTRAINT "supply_tax_supply_id_supply_id_fk"
  FOREIGN KEY ("supply_id") REFERENCES "public"."supply"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."supply_tax"
  ADD CONSTRAINT "supply_tax_tax_id_tax_id_fk"
  FOREIGN KEY ("tax_id") REFERENCES "public"."tax"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supply_tax_supply_id_idx" ON "supply_tax" USING btree ("supply_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supply_tax_tax_id_idx" ON "supply_tax" USING btree ("tax_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe" (
  "product_id" text PRIMARY KEY NOT NULL,
  "description" text,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."recipe" DROP CONSTRAINT IF EXISTS "recipe_product_id_product_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."recipe"
  ADD CONSTRAINT "recipe_product_id_product_id_fk"
  FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_ingredient" (
  "recipe_id" text NOT NULL,
  "ingredient_id" text NOT NULL,
  "quantity" numeric(12, 4) NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "recipe_ingredient_pk" PRIMARY KEY ("recipe_id", "ingredient_id"),
  CONSTRAINT "recipe_ingredient_quantity_positive_check" CHECK ("quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."recipe_ingredient" DROP CONSTRAINT IF EXISTS "recipe_ingredient_recipe_id_recipe_product_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."recipe_ingredient" DROP CONSTRAINT IF EXISTS "recipe_ingredient_ingredient_id_ingredient_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."recipe_ingredient"
  ADD CONSTRAINT "recipe_ingredient_recipe_id_recipe_product_id_fk"
  FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("product_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."recipe_ingredient"
  ADD CONSTRAINT "recipe_ingredient_ingredient_id_ingredient_id_fk"
  FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_ingredient_recipe_id_idx" ON "recipe_ingredient" USING btree ("recipe_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_ingredient_ingredient_id_idx" ON "recipe_ingredient" USING btree ("ingredient_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_supply" (
  "recipe_id" text NOT NULL,
  "supply_id" text NOT NULL,
  "quantity" numeric(12, 4) NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "recipe_supply_pk" PRIMARY KEY ("recipe_id", "supply_id"),
  CONSTRAINT "recipe_supply_quantity_positive_check" CHECK ("quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."recipe_supply" DROP CONSTRAINT IF EXISTS "recipe_supply_recipe_id_recipe_product_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."recipe_supply" DROP CONSTRAINT IF EXISTS "recipe_supply_supply_id_supply_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."recipe_supply"
  ADD CONSTRAINT "recipe_supply_recipe_id_recipe_product_id_fk"
  FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("product_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."recipe_supply"
  ADD CONSTRAINT "recipe_supply_supply_id_supply_id_fk"
  FOREIGN KEY ("supply_id") REFERENCES "public"."supply"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_supply_recipe_id_idx" ON "recipe_supply" USING btree ("recipe_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_supply_supply_id_idx" ON "recipe_supply" USING btree ("supply_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "variation" (
  "id" text PRIMARY KEY NOT NULL,
  "product_id" text NOT NULL,
  "name" text NOT NULL,
  "price_cents" integer NOT NULL,
  "kitchen_name" text NOT NULL,
  "customer_description" text,
  "kitchen_description" text,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp,
  CONSTRAINT "variation_price_cents_non_negative_check" CHECK ("price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."variation" DROP CONSTRAINT IF EXISTS "variation_product_id_product_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."variation"
  ADD CONSTRAINT "variation_product_id_product_id_fk"
  FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "variation_product_name_unique" ON "variation" USING btree ("product_id", "name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variation_product_id_idx" ON "variation" USING btree ("product_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "variation_recipe" (
  "variation_id" text PRIMARY KEY NOT NULL,
  "description" text,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."variation_recipe" DROP CONSTRAINT IF EXISTS "variation_recipe_variation_id_variation_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."variation_recipe"
  ADD CONSTRAINT "variation_recipe_variation_id_variation_id_fk"
  FOREIGN KEY ("variation_id") REFERENCES "public"."variation"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "variation_recipe_ingredient" (
  "variation_id" text NOT NULL,
  "ingredient_id" text NOT NULL,
  "quantity" numeric(12, 4) NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "variation_recipe_ingredient_pk" PRIMARY KEY ("variation_id", "ingredient_id"),
  CONSTRAINT "variation_recipe_ingredient_quantity_positive_check" CHECK ("quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."variation_recipe_ingredient" DROP CONSTRAINT IF EXISTS "variation_recipe_ingredient_variation_id_variation_recipe_variation_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."variation_recipe_ingredient" DROP CONSTRAINT IF EXISTS "variation_recipe_ingredient_ingredient_id_ingredient_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."variation_recipe_ingredient"
  ADD CONSTRAINT "variation_recipe_ingredient_variation_id_variation_recipe_variation_id_fk"
  FOREIGN KEY ("variation_id") REFERENCES "public"."variation_recipe"("variation_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."variation_recipe_ingredient"
  ADD CONSTRAINT "variation_recipe_ingredient_ingredient_id_ingredient_id_fk"
  FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variation_recipe_ingredient_variation_id_idx" ON "variation_recipe_ingredient" USING btree ("variation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variation_recipe_ingredient_ingredient_id_idx" ON "variation_recipe_ingredient" USING btree ("ingredient_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "variation_recipe_supply" (
  "variation_id" text NOT NULL,
  "supply_id" text NOT NULL,
  "quantity" numeric(12, 4) NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "variation_recipe_supply_pk" PRIMARY KEY ("variation_id", "supply_id"),
  CONSTRAINT "variation_recipe_supply_quantity_positive_check" CHECK ("quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."variation_recipe_supply" DROP CONSTRAINT IF EXISTS "variation_recipe_supply_variation_id_variation_recipe_variation_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."variation_recipe_supply" DROP CONSTRAINT IF EXISTS "variation_recipe_supply_supply_id_supply_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."variation_recipe_supply"
  ADD CONSTRAINT "variation_recipe_supply_variation_id_variation_recipe_variation_id_fk"
  FOREIGN KEY ("variation_id") REFERENCES "public"."variation_recipe"("variation_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."variation_recipe_supply"
  ADD CONSTRAINT "variation_recipe_supply_supply_id_supply_id_fk"
  FOREIGN KEY ("supply_id") REFERENCES "public"."supply"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variation_recipe_supply_variation_id_idx" ON "variation_recipe_supply" USING btree ("variation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variation_recipe_supply_supply_id_idx" ON "variation_recipe_supply" USING btree ("supply_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modifier" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "kitchen_name" text NOT NULL,
  "customer_label" text NOT NULL,
  "multi_select" boolean NOT NULL DEFAULT false,
  "min_select" integer NOT NULL DEFAULT 0,
  "max_select" integer,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "modifier_min_select_non_negative_check" CHECK ("min_select" >= 0),
  CONSTRAINT "modifier_max_select_ge_min_select_check" CHECK ("max_select" IS NULL OR "max_select" >= "min_select"),
  CONSTRAINT "modifier_single_select_min_limit_check" CHECK ("multi_select" OR "min_select" <= 1),
  CONSTRAINT "modifier_single_select_max_limit_check" CHECK ("multi_select" OR "max_select" IS NULL OR "max_select" <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "modifier_name_unique" ON "modifier" USING btree ("name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modifier_option" (
  "id" text PRIMARY KEY NOT NULL,
  "modifier_id" text NOT NULL,
  "name" text NOT NULL,
  "kitchen_name" text NOT NULL,
  "customer_name" text NOT NULL,
  "price_cents" integer NOT NULL DEFAULT 0,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_default" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "modifier_option_price_cents_non_negative_check" CHECK ("price_cents" >= 0),
  CONSTRAINT "modifier_option_sort_order_non_negative_check" CHECK ("sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."modifier_option" DROP CONSTRAINT IF EXISTS "modifier_option_modifier_id_modifier_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."modifier_option"
  ADD CONSTRAINT "modifier_option_modifier_id_modifier_id_fk"
  FOREIGN KEY ("modifier_id") REFERENCES "public"."modifier"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "modifier_option_modifier_name_unique"
  ON "modifier_option" USING btree ("modifier_id", "name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "modifier_option_single_default_unique"
  ON "modifier_option" USING btree ("modifier_id")
  WHERE "is_default" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "modifier_option_modifier_id_idx" ON "modifier_option" USING btree ("modifier_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "modifier_option_modifier_id_sort_order_idx"
  ON "modifier_option" USING btree ("modifier_id", "sort_order");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_modifier" (
  "product_id" text NOT NULL,
  "modifier_id" text NOT NULL,
  "sort_order" integer NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "product_modifier_pk" PRIMARY KEY ("product_id", "modifier_id"),
  CONSTRAINT "product_modifier_sort_order_non_negative_check" CHECK ("sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_modifier" DROP CONSTRAINT IF EXISTS "product_modifier_product_id_product_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_modifier" DROP CONSTRAINT IF EXISTS "product_modifier_modifier_id_modifier_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_modifier"
  ADD CONSTRAINT "product_modifier_product_id_product_id_fk"
  FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."product_modifier"
  ADD CONSTRAINT "product_modifier_modifier_id_modifier_id_fk"
  FOREIGN KEY ("modifier_id") REFERENCES "public"."modifier"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_modifier_product_sort_order_unique"
  ON "product_modifier" USING btree ("product_id", "sort_order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_modifier_product_id_idx" ON "product_modifier" USING btree ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_modifier_modifier_id_idx" ON "product_modifier" USING btree ("modifier_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modifier_option_ingredient" (
  "modifier_option_id" text NOT NULL,
  "ingredient_id" text NOT NULL,
  "quantity" numeric(12, 4) NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "modifier_option_ingredient_pk" PRIMARY KEY ("modifier_option_id", "ingredient_id"),
  CONSTRAINT "modifier_option_ingredient_quantity_positive_check" CHECK ("quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."modifier_option_ingredient" DROP CONSTRAINT IF EXISTS "modifier_option_ingredient_modifier_option_id_modifier_option_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."modifier_option_ingredient" DROP CONSTRAINT IF EXISTS "modifier_option_ingredient_ingredient_id_ingredient_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."modifier_option_ingredient"
  ADD CONSTRAINT "modifier_option_ingredient_modifier_option_id_modifier_option_id_fk"
  FOREIGN KEY ("modifier_option_id") REFERENCES "public"."modifier_option"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."modifier_option_ingredient"
  ADD CONSTRAINT "modifier_option_ingredient_ingredient_id_ingredient_id_fk"
  FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "modifier_option_ingredient_modifier_option_id_idx"
  ON "modifier_option_ingredient" USING btree ("modifier_option_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "modifier_option_ingredient_ingredient_id_idx"
  ON "modifier_option_ingredient" USING btree ("ingredient_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modifier_option_supply" (
  "modifier_option_id" text NOT NULL,
  "supply_id" text NOT NULL,
  "quantity" numeric(12, 4) NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "modifier_option_supply_pk" PRIMARY KEY ("modifier_option_id", "supply_id"),
  CONSTRAINT "modifier_option_supply_quantity_positive_check" CHECK ("quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."modifier_option_supply" DROP CONSTRAINT IF EXISTS "modifier_option_supply_modifier_option_id_modifier_option_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."modifier_option_supply" DROP CONSTRAINT IF EXISTS "modifier_option_supply_supply_id_supply_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."modifier_option_supply"
  ADD CONSTRAINT "modifier_option_supply_modifier_option_id_modifier_option_id_fk"
  FOREIGN KEY ("modifier_option_id") REFERENCES "public"."modifier_option"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE IF EXISTS "public"."modifier_option_supply"
  ADD CONSTRAINT "modifier_option_supply_supply_id_supply_id_fk"
  FOREIGN KEY ("supply_id") REFERENCES "public"."supply"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "modifier_option_supply_modifier_option_id_idx"
  ON "modifier_option_supply" USING btree ("modifier_option_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "modifier_option_supply_supply_id_idx"
  ON "modifier_option_supply" USING btree ("supply_id");
