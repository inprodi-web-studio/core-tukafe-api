CREATE TABLE "organization_product_category" (
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "category_id" text NOT NULL REFERENCES "product_category"("id") ON DELETE CASCADE,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("organization_id", "category_id")
);
CREATE INDEX "organization_product_category_category_idx" ON "organization_product_category" ("category_id");
