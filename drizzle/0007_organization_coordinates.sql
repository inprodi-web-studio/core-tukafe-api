ALTER TABLE "organization"
  ADD COLUMN IF NOT EXISTS "latitude" double precision,
  ADD COLUMN IF NOT EXISTS "longitude" double precision;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_latitude_range_check'
  ) THEN
    ALTER TABLE "organization"
      ADD CONSTRAINT "organization_latitude_range_check"
      CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_longitude_range_check'
  ) THEN
    ALTER TABLE "organization"
      ADD CONSTRAINT "organization_longitude_range_check"
      CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_coordinates_pair_check'
  ) THEN
    ALTER TABLE "organization"
      ADD CONSTRAINT "organization_coordinates_pair_check"
      CHECK (
        ("latitude" IS NULL AND "longitude" IS NULL)
        OR
        ("latitude" IS NOT NULL AND "longitude" IS NOT NULL)
      );
  END IF;
END $$;
