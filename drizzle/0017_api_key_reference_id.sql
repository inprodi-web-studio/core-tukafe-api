ALTER TABLE "apikey"
ADD COLUMN IF NOT EXISTS "reference_id" text;

UPDATE "apikey"
SET "reference_id" = "user_id"
WHERE "reference_id" IS NULL;

ALTER TABLE "apikey"
DROP CONSTRAINT IF EXISTS "apikey_reference_id_user_id_fk";

ALTER TABLE "apikey"
ADD CONSTRAINT "apikey_reference_id_user_id_fk"
FOREIGN KEY ("reference_id")
REFERENCES "user"("id")
ON DELETE cascade;

CREATE INDEX IF NOT EXISTS "apikey_reference_id_idx"
ON "apikey" ("reference_id");
