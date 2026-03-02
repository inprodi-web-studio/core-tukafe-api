CREATE TYPE "public"."product_type" AS ENUM('simple', 'assembled', 'compound');--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"kitchen_name" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"customer_description" text,
	"kitchen_description" text,
	"unit_id" text NOT NULL,
	"category_id" text NOT NULL,
	"product_type" "product_type" DEFAULT 'simple' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "products_price_non_negative_check" CHECK ("products"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_color_hex_check" CHECK ("product_categories"."color" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text NOT NULL,
	"precision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "units_precision_non_negative_check" CHECK ("units"."precision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "products_unit_id_idx" ON "products" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_product_type_idx" ON "products" USING btree ("product_type");--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_name_unique" ON "product_categories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "units_name_unique" ON "units" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "units_abbreviation_unique" ON "units" USING btree ("abbreviation");