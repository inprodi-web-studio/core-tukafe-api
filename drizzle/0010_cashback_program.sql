ALTER TABLE "product_category"
  ADD COLUMN IF NOT EXISTS "is_cashback_eligible" boolean NOT NULL DEFAULT false;

ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS "cashback_redemption_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cashback_earned_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cashback_eligible_paid_cents" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "amount_due_cents" integer;

UPDATE "order"
SET "amount_due_cents" = "grand_total_cents" - "cashback_redemption_cents"
WHERE "amount_due_cents" IS NULL
  OR "amount_due_cents" <> "grand_total_cents" - "cashback_redemption_cents";

ALTER TABLE "order"
  ALTER COLUMN "amount_due_cents" SET DEFAULT 0,
  ALTER COLUMN "amount_due_cents" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_cashback_redemption_cents_non_negative_check'
  ) THEN
    ALTER TABLE "order"
      ADD CONSTRAINT "order_cashback_redemption_cents_non_negative_check" CHECK ("cashback_redemption_cents" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_cashback_earned_cents_non_negative_check'
  ) THEN
    ALTER TABLE "order"
      ADD CONSTRAINT "order_cashback_earned_cents_non_negative_check" CHECK ("cashback_earned_cents" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_cashback_eligible_paid_cents_non_negative_check'
  ) THEN
    ALTER TABLE "order"
      ADD CONSTRAINT "order_cashback_eligible_paid_cents_non_negative_check" CHECK ("cashback_eligible_paid_cents" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_amount_due_cents_non_negative_check'
  ) THEN
    ALTER TABLE "order"
      ADD CONSTRAINT "order_amount_due_cents_non_negative_check" CHECK ("amount_due_cents" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_cashback_redemption_lte_grand_total_check'
  ) THEN
    ALTER TABLE "order"
      ADD CONSTRAINT "order_cashback_redemption_lte_grand_total_check" CHECK ("cashback_redemption_cents" <= "grand_total_cents");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_amount_due_cashback_consistency_check'
  ) THEN
    ALTER TABLE "order"
      ADD CONSTRAINT "order_amount_due_cashback_consistency_check" CHECK ("amount_due_cents" = "grand_total_cents" - "cashback_redemption_cents");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "customer_cashback_account" (
  "customer_id" text PRIMARY KEY REFERENCES "customer"("id") ON DELETE cascade,
  "balance_cents" integer NOT NULL DEFAULT 0,
  "total_earned_cents" integer NOT NULL DEFAULT 0,
  "total_redeemed_cents" integer NOT NULL DEFAULT 0,
  "version" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "customer_cashback_account_balance_non_negative_check" CHECK ("balance_cents" >= 0),
  CONSTRAINT "customer_cashback_account_total_earned_non_negative_check" CHECK ("total_earned_cents" >= 0),
  CONSTRAINT "customer_cashback_account_total_redeemed_non_negative_check" CHECK ("total_redeemed_cents" >= 0),
  CONSTRAINT "customer_cashback_account_version_non_negative_check" CHECK ("version" >= 0)
);

CREATE TABLE IF NOT EXISTS "customer_cashback_ledger" (
  "id" text PRIMARY KEY,
  "customer_id" text NOT NULL REFERENCES "customer"("id") ON DELETE cascade,
  "order_id" text NOT NULL REFERENCES "order"("id") ON DELETE restrict,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE restrict,
  "movement_type" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "balance_after_cents" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "customer_cashback_ledger_movement_type_check" CHECK ("movement_type" in ('earned', 'redeemed')),
  CONSTRAINT "customer_cashback_ledger_amount_positive_check" CHECK ("amount_cents" > 0),
  CONSTRAINT "customer_cashback_ledger_balance_after_non_negative_check" CHECK ("balance_after_cents" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_cashback_ledger_order_movement_unique"
  ON "customer_cashback_ledger" ("order_id", "movement_type");

CREATE INDEX IF NOT EXISTS "customer_cashback_ledger_customer_created_at_idx"
  ON "customer_cashback_ledger" ("customer_id", "created_at");

CREATE INDEX IF NOT EXISTS "customer_cashback_ledger_order_id_idx"
  ON "customer_cashback_ledger" ("order_id");

CREATE INDEX IF NOT EXISTS "customer_cashback_ledger_organization_id_idx"
  ON "customer_cashback_ledger" ("organization_id");
