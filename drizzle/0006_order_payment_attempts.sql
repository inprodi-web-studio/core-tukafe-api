CREATE TABLE IF NOT EXISTS "order_payment_attempt" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE restrict,
  "order_id" text REFERENCES "order"("id") ON DELETE set null,
  "provider" text NOT NULL DEFAULT 'zettle',
  "reference" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'MXN',
  "status" text NOT NULL DEFAULT 'pending',
  "transaction_id" text,
  "reference_number" text,
  "card_brand" text,
  "entry_mode" text,
  "authorization_code" text,
  "obfuscated_pan" text,
  "raw_response" jsonb,
  "failure_code" text,
  "failure_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "order_payment_attempt_provider_check" CHECK ("provider" in ('zettle')),
  CONSTRAINT "order_payment_attempt_status_check" CHECK ("status" in ('pending', 'paid_unlinked', 'completed', 'cancelled', 'failed', 'requires_reconciliation')),
  CONSTRAINT "order_payment_attempt_amount_positive_check" CHECK ("amount_cents" > 0),
  CONSTRAINT "order_payment_attempt_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS "order_payment_attempt_reference_unique"
  ON "order_payment_attempt" ("reference");

CREATE UNIQUE INDEX IF NOT EXISTS "order_payment_attempt_transaction_id_unique"
  ON "order_payment_attempt" ("transaction_id");

CREATE INDEX IF NOT EXISTS "order_payment_attempt_organization_status_created_at_idx"
  ON "order_payment_attempt" ("organization_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "order_payment_attempt_order_id_idx"
  ON "order_payment_attempt" ("order_id");
