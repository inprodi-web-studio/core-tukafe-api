create table if not exists "coupon" (
  "id" text primary key,
  "organization_id" text not null references "organization"("id") on delete restrict,
  "code" text not null,
  "normalized_code" text not null,
  "is_active" boolean not null default true,
  "starts_at" timestamp with time zone not null,
  "ends_at" timestamp with time zone,
  "discount_type" text not null,
  "discount_value" integer not null,
  "allow_with_loyalty_free_drink" boolean not null default false,
  "period_limit_type" text,
  "period_limit_count" integer,
  "max_redemptions_per_customer" integer not null default 1,
  "min_eligible_subtotal_cents" integer,
  "max_discount_cents" integer,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "coupon_code_non_empty_check" check (btrim("code") <> ''),
  constraint "coupon_normalized_code_non_empty_check" check (btrim("normalized_code") <> ''),
  constraint "coupon_discount_value_positive_check" check ("discount_value" > 0),
  constraint "coupon_discount_type_check" check ("discount_type" in ('percentage', 'fixed_amount')),
  constraint "coupon_discount_percentage_range_check" check ("discount_type" <> 'percentage' or "discount_value" between 1 and 10000),
  constraint "coupon_period_limit_type_check" check ("period_limit_type" is null or "period_limit_type" in ('day', 'week', 'month')),
  constraint "coupon_period_limit_pair_check" check (("period_limit_type" is null and "period_limit_count" is null) or ("period_limit_type" is not null and "period_limit_count" is not null and "period_limit_count" > 0)),
  constraint "coupon_max_redemptions_per_customer_positive_check" check ("max_redemptions_per_customer" > 0),
  constraint "coupon_min_eligible_subtotal_non_negative_check" check ("min_eligible_subtotal_cents" is null or "min_eligible_subtotal_cents" >= 0),
  constraint "coupon_max_discount_non_negative_check" check ("max_discount_cents" is null or "max_discount_cents" >= 0),
  constraint "coupon_validity_range_check" check ("ends_at" is null or "ends_at" >= "starts_at")
);

create unique index if not exists "coupon_org_normalized_code_unique"
  on "coupon" ("organization_id", "normalized_code");
create index if not exists "coupon_org_id_idx" on "coupon" ("organization_id");
create index if not exists "coupon_is_active_idx" on "coupon" ("is_active");
create index if not exists "coupon_starts_at_idx" on "coupon" ("starts_at");
create index if not exists "coupon_ends_at_idx" on "coupon" ("ends_at");

create table if not exists "coupon_product_rule" (
  "coupon_id" text not null references "coupon"("id") on delete cascade,
  "product_id" text not null references "product"("id") on delete restrict,
  "mode" text not null,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "coupon_product_rule_pk" primary key ("coupon_id", "product_id"),
  constraint "coupon_product_rule_mode_check" check ("mode" in ('include', 'exclude'))
);
create index if not exists "coupon_product_rule_coupon_id_idx" on "coupon_product_rule" ("coupon_id");
create index if not exists "coupon_product_rule_product_id_idx" on "coupon_product_rule" ("product_id");

create table if not exists "coupon_category_rule" (
  "coupon_id" text not null references "coupon"("id") on delete cascade,
  "category_id" text not null references "product_category"("id") on delete restrict,
  "mode" text not null,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "coupon_category_rule_pk" primary key ("coupon_id", "category_id"),
  constraint "coupon_category_rule_mode_check" check ("mode" in ('include', 'exclude'))
);
create index if not exists "coupon_category_rule_coupon_id_idx" on "coupon_category_rule" ("coupon_id");
create index if not exists "coupon_category_rule_category_id_idx" on "coupon_category_rule" ("category_id");

create table if not exists "coupon_period_usage" (
  "coupon_id" text not null references "coupon"("id") on delete cascade,
  "organization_id" text not null references "organization"("id") on delete restrict,
  "period_type" text not null,
  "period_start_date" date not null,
  "usage_count" integer not null default 0,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "coupon_period_usage_pk" primary key ("coupon_id", "organization_id", "period_type", "period_start_date"),
  constraint "coupon_period_usage_period_type_check" check ("period_type" in ('day', 'week', 'month')),
  constraint "coupon_period_usage_count_non_negative_check" check ("usage_count" >= 0)
);
create index if not exists "coupon_period_usage_org_period_idx" on "coupon_period_usage" ("organization_id", "period_start_date");

create table if not exists "coupon_redemption" (
  "id" text primary key,
  "coupon_id" text not null references "coupon"("id") on delete restrict,
  "order_id" text not null,
  "organization_id" text not null references "organization"("id") on delete restrict,
  "customer_id" text references "customer"("id") on delete set null,
  "code_snapshot" text not null,
  "discount_cents" integer not null,
  "period_type" text,
  "period_start_date" date,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "coupon_redemption_discount_non_negative_check" check ("discount_cents" >= 0),
  constraint "coupon_redemption_period_pair_check" check (("period_type" is null and "period_start_date" is null) or ("period_type" is not null and "period_start_date" is not null))
);
create unique index if not exists "coupon_redemption_order_id_unique" on "coupon_redemption" ("order_id");
create index if not exists "coupon_redemption_coupon_id_idx" on "coupon_redemption" ("coupon_id");
create index if not exists "coupon_redemption_customer_id_idx" on "coupon_redemption" ("customer_id");
create index if not exists "coupon_redemption_period_idx" on "coupon_redemption" ("period_type", "period_start_date");

alter table "order"
  add column if not exists "coupon_id" text references "coupon"("id") on delete restrict,
  add column if not exists "coupon_code" text,
  add column if not exists "coupon_discount_cents" integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_coupon_discount_cents_non_negative_check'
  ) then
    alter table "order"
      add constraint "order_coupon_discount_cents_non_negative_check" check ("coupon_discount_cents" >= 0);
  end if;
end $$;

create index if not exists "order_coupon_id_idx" on "order" ("coupon_id");

alter table "order_item"
  add column if not exists "coupon_discount_cents" integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_item_coupon_discount_cents_non_negative_check'
  ) then
    alter table "order_item"
      add constraint "order_item_coupon_discount_cents_non_negative_check" check ("coupon_discount_cents" >= 0);
  end if;
end $$;
