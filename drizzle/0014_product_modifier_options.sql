CREATE UNIQUE INDEX IF NOT EXISTS "modifier_option_modifier_id_id_unique"
  ON "modifier_option" ("modifier_id", "id");

CREATE TABLE IF NOT EXISTS "product_modifier_option" (
  "product_id" text NOT NULL,
  "modifier_id" text NOT NULL,
  "modifier_option_id" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "product_modifier_option_pk"
    PRIMARY KEY ("product_id", "modifier_id", "modifier_option_id"),
  CONSTRAINT "product_modifier_option_product_modifier_fk"
    FOREIGN KEY ("product_id", "modifier_id")
    REFERENCES "product_modifier" ("product_id", "modifier_id")
    ON DELETE cascade,
  CONSTRAINT "product_modifier_option_modifier_option_fk"
    FOREIGN KEY ("modifier_id", "modifier_option_id")
    REFERENCES "modifier_option" ("modifier_id", "id")
    ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "product_modifier_option_product_modifier_idx"
  ON "product_modifier_option" ("product_id", "modifier_id");

CREATE INDEX IF NOT EXISTS "product_modifier_option_modifier_option_id_idx"
  ON "product_modifier_option" ("modifier_option_id");
