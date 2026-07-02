CREATE TABLE IF NOT EXISTS "product_modifier_visibility_rule" (
  "product_id" text NOT NULL,
  "modifier_id" text NOT NULL,
  "variation_group_id" text NOT NULL,
  "variation_option_id" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "product_modifier_visibility_rule_pk"
    PRIMARY KEY ("product_id", "modifier_id", "variation_group_id", "variation_option_id"),
  CONSTRAINT "product_modifier_visibility_rule_product_modifier_fk"
    FOREIGN KEY ("product_id", "modifier_id")
    REFERENCES "product_modifier" ("product_id", "modifier_id")
    ON DELETE cascade,
  CONSTRAINT "product_modifier_visibility_rule_product_variation_group_fk"
    FOREIGN KEY ("product_id", "variation_group_id")
    REFERENCES "product_variation_group" ("product_id", "variation_group_id")
    ON DELETE cascade,
  CONSTRAINT "product_modifier_visibility_rule_variation_option_fk"
    FOREIGN KEY ("variation_option_id")
    REFERENCES "variation_group_option" ("id")
    ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "product_modifier_visibility_rule_product_modifier_idx"
  ON "product_modifier_visibility_rule" ("product_id", "modifier_id");

CREATE INDEX IF NOT EXISTS "product_modifier_visibility_rule_variation_option_idx"
  ON "product_modifier_visibility_rule" ("variation_option_id");
