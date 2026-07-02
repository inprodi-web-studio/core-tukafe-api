CREATE TABLE IF NOT EXISTS "customer_product_favorite" (
  "customer_id" text NOT NULL,
  "product_id" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "customer_product_favorite_pk" PRIMARY KEY("customer_id", "product_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'customer_product_favorite'
      AND constraint_name = 'customer_product_favorite_customer_id_customer_id_fk'
  ) THEN
    ALTER TABLE "customer_product_favorite"
      ADD CONSTRAINT "customer_product_favorite_customer_id_customer_id_fk"
      FOREIGN KEY ("customer_id")
      REFERENCES "public"."customer"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'customer_product_favorite'
      AND constraint_name = 'customer_product_favorite_product_id_product_id_fk'
  ) THEN
    ALTER TABLE "customer_product_favorite"
      ADD CONSTRAINT "customer_product_favorite_product_id_product_id_fk"
      FOREIGN KEY ("product_id")
      REFERENCES "public"."product"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "customer_product_favorite_customer_id_idx"
  ON "customer_product_favorite" USING btree ("customer_id");

CREATE INDEX IF NOT EXISTS "customer_product_favorite_product_id_idx"
  ON "customer_product_favorite" USING btree ("product_id");
