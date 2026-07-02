CREATE TABLE IF NOT EXISTS "customer_qr_login_token" (
  "id" text PRIMARY KEY NOT NULL,
  "customer_id" text NOT NULL REFERENCES "customer"("id") ON DELETE cascade,
  "token_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_qr_login_token_hash_unique"
  ON "customer_qr_login_token" ("token_hash");

CREATE INDEX IF NOT EXISTS "customer_qr_login_token_customer_id_idx"
  ON "customer_qr_login_token" ("customer_id");

CREATE INDEX IF NOT EXISTS "customer_qr_login_token_expires_at_idx"
  ON "customer_qr_login_token" ("expires_at");
