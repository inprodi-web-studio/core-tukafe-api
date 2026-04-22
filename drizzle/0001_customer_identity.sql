CREATE TABLE IF NOT EXISTS "customer" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text,
  "phone" text,
  "name" text,
  "middle_name" text,
  "last_name" text,
  "email" text,
  "group_id" text,
  "gender" text,
  "birthdate" date,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "deleted_at" timestamp
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'customer'
      AND constraint_name = 'customer_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "customer"
      ADD CONSTRAINT "customer_user_id_user_id_fk"
      FOREIGN KEY ("user_id")
      REFERENCES "public"."user"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'customer'
      AND constraint_name = 'customer_group_id_customer_group_id_fk'
  ) THEN
    ALTER TABLE "customer"
      ADD CONSTRAINT "customer_group_id_customer_group_id_fk"
      FOREIGN KEY ("group_id")
      REFERENCES "public"."customer_group"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "customer_user_id_active_unique"
  ON "customer" USING btree ("user_id")
  WHERE "deleted_at" IS NULL AND "user_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "customer_phone_active_unique"
  ON "customer" USING btree ("phone")
  WHERE "deleted_at" IS NULL AND "phone" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "customer_group_id_idx" ON "customer" USING btree ("group_id");
CREATE INDEX IF NOT EXISTS "customer_phone_idx" ON "customer" USING btree ("phone");
CREATE INDEX IF NOT EXISTS "customer_user_id_idx" ON "customer" USING btree ("user_id");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'customer_profile'
  ) THEN
    INSERT INTO "customer" (
      "id",
      "user_id",
      "phone",
      "name",
      "middle_name",
      "last_name",
      "email",
      "group_id",
      "gender",
      "birthdate",
      "created_at",
      "updated_at",
      "deleted_at"
    )
    SELECT
      cp."user_id",
      cp."user_id",
      u."phone_number",
      u."name",
      u."middle_name",
      u."last_name",
      u."email",
      cp."group_id",
      cp."gender",
      cp."birthdate",
      cp."created_at",
      cp."updated_at",
      cp."deleted_at"
    FROM "customer_profile" cp
    JOIN "user" u ON u."id" = cp."user_id"
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;

INSERT INTO "customer" (
  "id",
  "user_id",
  "phone",
  "name",
  "middle_name",
  "last_name",
  "email",
  "created_at",
  "updated_at"
)
SELECT
  DISTINCT
  o."customer_id",
  u."id",
  u."phone_number",
  u."name",
  u."middle_name",
  u."last_name",
  u."email",
  now(),
  now()
FROM "order" o
JOIN "user" u ON u."id" = o."customer_id"
LEFT JOIN "customer" c ON c."id" = o."customer_id"
WHERE c."id" IS NULL
ON CONFLICT ("id") DO NOTHING;

DO $$
DECLARE fk_name text;
BEGIN
  SELECT tc.constraint_name
    INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
   AND tc.table_schema = ccu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'order'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'customer_id'
    AND ccu.table_name = 'user'
    AND ccu.column_name = 'id'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "order" DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'order'
      AND constraint_name = 'order_customer_id_customer_id_fk'
  ) THEN
    ALTER TABLE "order"
      ADD CONSTRAINT "order_customer_id_customer_id_fk"
      FOREIGN KEY ("customer_id")
      REFERENCES "public"."customer"("id")
      ON DELETE RESTRICT
      ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "order_customer_id_created_at_idx"
  ON "order" USING btree ("customer_id", "created_at");

DROP TABLE IF EXISTS "customer_profile";
