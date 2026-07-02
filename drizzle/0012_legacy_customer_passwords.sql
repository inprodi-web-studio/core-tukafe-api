CREATE TABLE IF NOT EXISTS "legacy_customer_password" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "password_hash" text NOT NULL,
  "algorithm" text NOT NULL,
  "parameters" text,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
