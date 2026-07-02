CREATE TABLE IF NOT EXISTS "product_category_link" (
  "product_id" text NOT NULL REFERENCES "product"("id") ON DELETE cascade,
  "category_id" text NOT NULL REFERENCES "product_category"("id") ON DELETE cascade,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "product_category_link_pk" PRIMARY KEY ("product_id", "category_id")
);

CREATE INDEX IF NOT EXISTS "product_category_link_product_id_idx"
  ON "product_category_link" ("product_id");

CREATE INDEX IF NOT EXISTS "product_category_link_category_id_idx"
  ON "product_category_link" ("category_id");

INSERT INTO "product_category_link" ("product_id", "category_id", "created_at", "updated_at")
SELECT "id", "category_id", now(), now()
FROM "product"
WHERE "category_id" IS NOT NULL
ON CONFLICT ("product_id", "category_id") DO NOTHING;
