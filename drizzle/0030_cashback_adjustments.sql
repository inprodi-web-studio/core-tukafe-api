ALTER TABLE "customer_cashback_ledger"
  ALTER COLUMN "order_id" DROP NOT NULL,
  ALTER COLUMN "organization_id" DROP NOT NULL,
  ADD COLUMN "created_by_user_id" text REFERENCES "user"("id") ON DELETE RESTRICT,
  ADD COLUMN "reason" text;

ALTER TABLE "customer_cashback_ledger"
  DROP CONSTRAINT "customer_cashback_ledger_movement_type_check";

ALTER TABLE "customer_cashback_ledger"
  ADD CONSTRAINT "customer_cashback_ledger_movement_type_check"
    CHECK ("movement_type" in ('earned', 'redeemed', 'adjustment_credit', 'adjustment_debit')),
  ADD CONSTRAINT "customer_cashback_ledger_source_consistency_check"
    CHECK (
      (
        "movement_type" in ('earned', 'redeemed')
        and "order_id" is not null
        and "organization_id" is not null
        and "created_by_user_id" is null
        and "reason" is null
      ) or (
        "movement_type" in ('adjustment_credit', 'adjustment_debit')
        and "order_id" is null
        and "organization_id" is null
        and "created_by_user_id" is not null
        and "reason" is not null
        and btrim("reason") <> ''
      )
    );

CREATE INDEX "customer_cashback_ledger_created_at_idx"
  ON "customer_cashback_ledger" ("created_at", "id");
