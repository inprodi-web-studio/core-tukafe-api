ALTER TABLE "coupon"
  ALTER COLUMN "max_redemptions_per_customer" DROP NOT NULL;

ALTER TABLE "coupon"
  DROP CONSTRAINT IF EXISTS "coupon_max_redemptions_per_customer_positive_check";

ALTER TABLE "coupon"
  ADD CONSTRAINT "coupon_max_redemptions_per_customer_positive_check"
  CHECK (
    "max_redemptions_per_customer" IS NULL
    OR "max_redemptions_per_customer" > 0
  );
