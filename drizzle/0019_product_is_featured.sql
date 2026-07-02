ALTER TABLE "product"
ADD COLUMN IF NOT EXISTS "is_featured" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "product_is_featured_idx"
ON "product" ("is_featured");
