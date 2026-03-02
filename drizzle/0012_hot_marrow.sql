CREATE UNIQUE INDEX IF NOT EXISTS "upload_reference_single_image_entity_unique"
  ON "upload_reference" USING btree ("entity_type", "entity_id")
  WHERE "entity_type" NOT IN ('organization', 'customer', 'user');
