CREATE TABLE IF NOT EXISTS "work_order" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE restrict,
  "order_id" text NOT NULL REFERENCES "order"("id") ON DELETE cascade,
  "order_item_id" text NOT NULL REFERENCES "order_item"("id") ON DELETE cascade,
  "order_folio" text NOT NULL,
  "customer_display_name" text,
  "product_name" text NOT NULL,
  "product_kitchen_name" text,
  "variation_name" text,
  "modifiers_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "order_comment" text,
  "item_comment" text,
  "unit_index" integer NOT NULL DEFAULT 1,
  "quantity_snapshot" numeric(12, 6) NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "completed_at" timestamp,
  "completed_by_user_id" text REFERENCES "user"("id") ON DELETE restrict,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "work_order_status_check" CHECK ("status" in ('open', 'completed')),
  CONSTRAINT "work_order_unit_index_positive_check" CHECK ("unit_index" > 0),
  CONSTRAINT "work_order_quantity_snapshot_positive_check" CHECK ("quantity_snapshot" > 0),
  CONSTRAINT "work_order_quantity_snapshot_precision_check" CHECK (scale("quantity_snapshot") <= 6),
  CONSTRAINT "work_order_completion_consistency_check" CHECK (
    ("status" = 'open' AND "completed_at" IS NULL AND "completed_by_user_id" IS NULL)
    OR
    ("status" = 'completed' AND "completed_at" IS NOT NULL AND "completed_by_user_id" IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS "work_order_organization_status_created_at_idx"
  ON "work_order" ("organization_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "work_order_order_id_idx" ON "work_order" ("order_id");
CREATE INDEX IF NOT EXISTS "work_order_order_item_id_idx" ON "work_order" ("order_item_id");
CREATE INDEX IF NOT EXISTS "work_order_completed_by_user_id_idx"
  ON "work_order" ("completed_by_user_id");

CREATE OR REPLACE FUNCTION notify_work_order_event()
RETURNS trigger AS $$
DECLARE
  payload json;
BEGIN
  IF TG_OP = 'INSERT' THEN
    payload = json_build_object(
      'type', 'workOrder.created',
      'organizationId', NEW.organization_id,
      'workOrderId', NEW.id
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    payload = json_build_object(
      'type', 'workOrder.completed',
      'organizationId', NEW.organization_id,
      'workOrderId', NEW.id
    );
  ELSE
    RETURN NEW;
  END IF;

  PERFORM pg_notify('work_order_events', payload::text);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS work_order_notify_insert ON work_order;
CREATE TRIGGER work_order_notify_insert
AFTER INSERT ON work_order
FOR EACH ROW
EXECUTE FUNCTION notify_work_order_event();

DROP TRIGGER IF EXISTS work_order_notify_completed ON work_order;
CREATE TRIGGER work_order_notify_completed
AFTER UPDATE OF status ON work_order
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
EXECUTE FUNCTION notify_work_order_event();
