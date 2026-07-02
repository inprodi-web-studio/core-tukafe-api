ALTER TABLE "apikey"
ADD COLUMN IF NOT EXISTS "config_id" text;
