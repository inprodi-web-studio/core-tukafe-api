CREATE INDEX IF NOT EXISTS "order_organization_id_created_at_idx"
  ON "order" USING btree ("organization_id", "created_at");
