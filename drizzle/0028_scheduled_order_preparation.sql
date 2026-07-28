ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp with time zone;

ALTER TABLE "work_order"
  ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "work_order_organization_status_scheduled_for_idx"
  ON "work_order" ("organization_id", "status", "scheduled_for");
