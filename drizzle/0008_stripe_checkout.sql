ALTER TABLE "customer"
  ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;

CREATE UNIQUE INDEX IF NOT EXISTS "customer_stripe_customer_id_unique"
  ON "customer" ("stripe_customer_id")
  WHERE "stripe_customer_id" IS NOT NULL;

ALTER TABLE "order_payment_attempt"
  ADD COLUMN IF NOT EXISTS "customer_id" text REFERENCES "customer"("id") ON DELETE set null;

ALTER TABLE "order_payment_attempt"
  ADD COLUMN IF NOT EXISTS "order_payload" jsonb;

CREATE INDEX IF NOT EXISTS "order_payment_attempt_customer_id_idx"
  ON "order_payment_attempt" ("customer_id");

ALTER TABLE "order_payment_attempt"
  DROP CONSTRAINT IF EXISTS "order_payment_attempt_provider_check";

ALTER TABLE "order_payment_attempt"
  ADD CONSTRAINT "order_payment_attempt_provider_check"
  CHECK ("provider" in ('zettle', 'stripe'));
