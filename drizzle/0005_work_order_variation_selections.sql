ALTER TABLE "work_order"
  ADD COLUMN IF NOT EXISTS "variation_selections_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb;
