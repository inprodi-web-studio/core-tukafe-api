ALTER TABLE "product_category"
ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "product_category_parent_sort_order_idx"
ON "product_category" ("parent_id", "sort_order");

ALTER TABLE "product_category"
DROP CONSTRAINT IF EXISTS "product_category_sort_order_non_negative_check";

ALTER TABLE "product_category"
ADD CONSTRAINT "product_category_sort_order_non_negative_check"
CHECK ("sort_order" >= 0);
