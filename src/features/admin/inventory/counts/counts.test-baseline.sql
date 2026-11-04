-- Minimal pre-count inventory schema for the opt-in PostgreSQL integration suite.
CREATE TYPE inventory_movement_type AS ENUM ('adjustment_entry','adjustment_exit','adjustment_reversal','checkout_reserve','order_reserve','reservation_release','sale_consumption','purchase_receipt','purchase_receipt_reversal');
CREATE TABLE "user" (id text PRIMARY KEY, name text NOT NULL, email text, role text);
CREATE TABLE organization (id text PRIMARY KEY, name text, slug text, timezone text, address text, deleted_at timestamp);
CREATE TABLE unit (id text PRIMARY KEY, name text, abbreviation text, precision integer);
CREATE TABLE ingredient_category (id text PRIMARY KEY, name text, color text, icon text);
CREATE TABLE ingredient (id text PRIMARY KEY, name text, base_unit_id text, category_id text, base_cost_per_unit numeric, is_inventory_tracked boolean, tracks_lots boolean, is_perishable boolean, expiration_warning_days integer DEFAULT 3, deleted_at timestamp);
CREATE TABLE supply (LIKE ingredient INCLUDING ALL);
CREATE TABLE product (id text PRIMARY KEY, name text, unit_id text, inventory_tracking_mode text, deleted_at timestamp);
CREATE TABLE variation (id text PRIMARY KEY, product_id text, combination_key text, deleted_at timestamp);
CREATE TABLE inventory_location (
  id text PRIMARY KEY, name text NOT NULL, type text NOT NULL, organization_id text REFERENCES organization(id), timezone text NOT NULL,
  is_default_sales_location boolean NOT NULL DEFAULT false, sales_enforcement_enabled boolean NOT NULL DEFAULT false,
  activated_at timestamptz, activated_by_user_id text, deactivated_at timestamptz, deactivated_by_user_id text,
  deactivation_reason text, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(), deleted_at timestamp
);
CREATE TABLE inventory_location_access (location_id text, user_id text, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
CREATE TABLE inventory_item (
  id text PRIMARY KEY, kind text NOT NULL, ingredient_id text, supply_id text, product_id text, variation_id text, base_unit_id text,
  is_tracked boolean DEFAULT true, tracks_lots boolean DEFAULT false, is_perishable boolean DEFAULT false, expiration_warning_days integer DEFAULT 3,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX inventory_item_ingredient_unique ON inventory_item(ingredient_id) WHERE ingredient_id IS NOT NULL;
CREATE UNIQUE INDEX inventory_item_supply_unique ON inventory_item(supply_id) WHERE supply_id IS NOT NULL;
CREATE UNIQUE INDEX inventory_item_product_unique ON inventory_item(product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX inventory_item_variation_unique ON inventory_item(variation_id) WHERE variation_id IS NOT NULL;
CREATE TABLE inventory_lot (
  id text PRIMARY KEY, inventory_item_id text NOT NULL REFERENCES inventory_item(id), lot_code text, normalized_lot_code text, internal_batch_key text NOT NULL,
  expires_on date, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(), UNIQUE(inventory_item_id,internal_batch_key)
);
CREATE UNIQUE INDEX inventory_lot_item_code_unique ON inventory_lot(inventory_item_id,normalized_lot_code) WHERE normalized_lot_code IS NOT NULL;
CREATE TABLE inventory_location_item (location_id text, inventory_item_id text, is_active boolean DEFAULT true, low_stock_threshold numeric(12,6), created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(), PRIMARY KEY(location_id,inventory_item_id));
CREATE TABLE inventory_balance (
  location_id text NOT NULL REFERENCES inventory_location(id), inventory_item_id text NOT NULL REFERENCES inventory_item(id), lot_id text NOT NULL REFERENCES inventory_lot(id),
  on_hand_quantity numeric(12,6) NOT NULL DEFAULT 0 CHECK(on_hand_quantity >= 0), reserved_quantity numeric(12,6) NOT NULL DEFAULT 0 CHECK(reserved_quantity >= 0),
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(), PRIMARY KEY(location_id,inventory_item_id,lot_id)
);
CREATE TABLE inventory_movement (
  id text PRIMARY KEY, location_id text NOT NULL REFERENCES inventory_location(id), type inventory_movement_type NOT NULL,
  adjustment_id text, reservation_id text, order_id text, work_order_id text, purchase_receipt_id text, actor_user_id text,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
CREATE TABLE inventory_movement_line (
  id text PRIMARY KEY, movement_id text NOT NULL REFERENCES inventory_movement(id), inventory_item_id text NOT NULL REFERENCES inventory_item(id), lot_id text NOT NULL REFERENCES inventory_lot(id),
  on_hand_delta numeric(12,6) DEFAULT 0, reserved_delta numeric(12,6) DEFAULT 0, on_hand_after numeric(12,6) NOT NULL, reserved_after numeric(12,6) NOT NULL,
  created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(), CHECK(on_hand_delta <> 0 OR reserved_delta <> 0)
);
