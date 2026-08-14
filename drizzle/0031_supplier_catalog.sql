CREATE TABLE "supplier_item" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"ingredient_id" text,
	"supply_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "supplier_item_exactly_one_catalog_item_check" CHECK (num_nonnulls("supplier_item"."ingredient_id", "supplier_item"."supply_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "supplier_item_presentation" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_item_id" text NOT NULL,
	"name" text NOT NULL,
	"content_quantity" numeric(14, 6) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "supplier_item_presentation_content_positive_check" CHECK ("supplier_item_presentation"."content_quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_presentation_cost" (
	"id" text PRIMARY KEY NOT NULL,
	"presentation_id" text NOT NULL,
	"price_cents" integer NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_by_user_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_presentation_cost_price_positive_check" CHECK ("supplier_presentation_cost"."price_cents" > 0),
	CONSTRAINT "supplier_presentation_cost_interval_check" CHECK ("supplier_presentation_cost"."effective_to" IS NULL OR "supplier_presentation_cost"."effective_to" >= "supplier_presentation_cost"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "supplier_item" ADD CONSTRAINT "supplier_item_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier_item" ADD CONSTRAINT "supplier_item_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier_item" ADD CONSTRAINT "supplier_item_supply_id_supply_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supply"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier_item_presentation" ADD CONSTRAINT "supplier_item_presentation_supplier_item_id_supplier_item_id_fk" FOREIGN KEY ("supplier_item_id") REFERENCES "public"."supplier_item"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier_presentation_cost" ADD CONSTRAINT "supplier_presentation_cost_presentation_id_supplier_item_presentation_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."supplier_item_presentation"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "supplier_presentation_cost" ADD CONSTRAINT "supplier_presentation_cost_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_item_active_ingredient_unique" ON "supplier_item" USING btree ("supplier_id","ingredient_id") WHERE "supplier_item"."deleted_at" IS NULL AND "supplier_item"."ingredient_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_item_active_supply_unique" ON "supplier_item" USING btree ("supplier_id","supply_id") WHERE "supplier_item"."deleted_at" IS NULL AND "supplier_item"."supply_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "supplier_item_supplier_id_idx" ON "supplier_item" USING btree ("supplier_id");
--> statement-breakpoint
CREATE INDEX "supplier_item_ingredient_id_idx" ON "supplier_item" USING btree ("ingredient_id");
--> statement-breakpoint
CREATE INDEX "supplier_item_supply_id_idx" ON "supplier_item" USING btree ("supply_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_item_presentation_active_name_unique" ON "supplier_item_presentation" USING btree ("supplier_item_id","name") WHERE "supplier_item_presentation"."deleted_at" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_item_presentation_active_default_unique" ON "supplier_item_presentation" USING btree ("supplier_item_id") WHERE "supplier_item_presentation"."deleted_at" IS NULL AND "supplier_item_presentation"."is_default" = true;
--> statement-breakpoint
CREATE INDEX "supplier_item_presentation_supplier_item_id_idx" ON "supplier_item_presentation" USING btree ("supplier_item_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_presentation_cost_current_unique" ON "supplier_presentation_cost" USING btree ("presentation_id") WHERE "supplier_presentation_cost"."effective_to" IS NULL;
--> statement-breakpoint
CREATE INDEX "supplier_presentation_cost_presentation_id_idx" ON "supplier_presentation_cost" USING btree ("presentation_id");
--> statement-breakpoint
CREATE INDEX "supplier_presentation_cost_effective_from_idx" ON "supplier_presentation_cost" USING btree ("effective_from");
