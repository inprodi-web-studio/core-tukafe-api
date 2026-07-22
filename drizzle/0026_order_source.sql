ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS "source" text;

UPDATE "order" AS target_order
SET "source" = COALESCE(
  (
    SELECT CASE payment_attempt."provider"
      WHEN 'zettle' THEN 'inplace'
      WHEN 'stripe' THEN 'mobile'
      ELSE NULL
    END
    FROM "order_payment_attempt" AS payment_attempt
    WHERE payment_attempt."order_id" = target_order."id"
    ORDER BY
      CASE WHEN payment_attempt."status" = 'completed' THEN 0 ELSE 1 END,
      payment_attempt."updated_at" DESC,
      payment_attempt."id" DESC
    LIMIT 1
  ),
  'unknown'
)
WHERE target_order."source" IS NULL;

ALTER TABLE "order"
  ALTER COLUMN "source" SET DEFAULT 'unknown',
  ALTER COLUMN "source" SET NOT NULL;

ALTER TABLE "order"
  DROP CONSTRAINT IF EXISTS "order_source_check";

ALTER TABLE "order"
  ADD CONSTRAINT "order_source_check"
  CHECK ("source" IN ('inplace', 'mobile', 'admin', 'unknown'));
