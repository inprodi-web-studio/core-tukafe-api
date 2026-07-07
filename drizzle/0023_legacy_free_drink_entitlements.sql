ALTER TABLE "customer_order_promotion_state"
  ADD COLUMN IF NOT EXISTS "legacy_free_drink_granted_at" timestamp,
  ADD COLUMN IF NOT EXISTS "legacy_free_drink_redeemed_at" timestamp;

INSERT INTO "customer_order_promotion_state" (
  "customer_id",
  "progress_count",
  "candidate_product_ids",
  "legacy_free_drink_granted_at",
  "version",
  "created_at",
  "updated_at"
)
SELECT
  c."id",
  0,
  '{}'::text[],
  now(),
  1,
  now(),
  now()
FROM "customer" c
INNER JOIN "customer_group" cg ON cg."id" = c."group_id"
WHERE lower(cg."name") = 'legacy'
  AND c."deleted_at" IS NULL
ON CONFLICT ("customer_id") DO UPDATE
SET
  "legacy_free_drink_granted_at" = COALESCE(
    "customer_order_promotion_state"."legacy_free_drink_granted_at",
    excluded."legacy_free_drink_granted_at"
  ),
  "progress_count" = CASE
    WHEN "customer_order_promotion_state"."legacy_free_drink_redeemed_at" IS NULL THEN 0
    ELSE "customer_order_promotion_state"."progress_count"
  END,
  "candidate_product_ids" = CASE
    WHEN "customer_order_promotion_state"."legacy_free_drink_redeemed_at" IS NULL THEN '{}'::text[]
    ELSE "customer_order_promotion_state"."candidate_product_ids"
  END,
  "version" = "customer_order_promotion_state"."version" + 1,
  "updated_at" = now()
WHERE "customer_order_promotion_state"."legacy_free_drink_redeemed_at" IS NULL;
