import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { customersDB } from "./customer.schema";
import { organizationDB } from "./organization.schema";
import { productCategoriesDB } from "./productCategory.schema";
import { productsDB } from "./product.schema";

export const COUPON_DISCOUNT_TYPES = ["percentage", "fixed_amount"] as const;
export const COUPON_PERIOD_LIMIT_TYPES = ["day", "week", "month"] as const;
export const COUPON_RULE_MODES = ["include", "exclude"] as const;

const coupons = pgTable(
  "coupon",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationDB.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    normalizedCode: text("normalized_code").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    discountType: text("discount_type", { enum: COUPON_DISCOUNT_TYPES }).notNull(),
    discountValue: integer("discount_value").notNull(),
    allowWithLoyaltyFreeDrink: boolean("allow_with_loyalty_free_drink").notNull().default(false),
    periodLimitType: text("period_limit_type", { enum: COUPON_PERIOD_LIMIT_TYPES }),
    periodLimitCount: integer("period_limit_count"),
    maxRedemptionsPerCustomer: integer("max_redemptions_per_customer").default(1),
    minEligibleSubtotalCents: integer("min_eligible_subtotal_cents"),
    maxDiscountCents: integer("max_discount_cents"),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("coupon_org_normalized_code_unique").on(table.organizationId, table.normalizedCode),
    index("coupon_org_id_idx").on(table.organizationId),
    index("coupon_is_active_idx").on(table.isActive),
    index("coupon_starts_at_idx").on(table.startsAt),
    index("coupon_ends_at_idx").on(table.endsAt),
    check("coupon_code_non_empty_check", sql`btrim(${table.code}) <> ''`),
    check("coupon_normalized_code_non_empty_check", sql`btrim(${table.normalizedCode}) <> ''`),
    check("coupon_discount_value_positive_check", sql`${table.discountValue} > 0`),
    check(
      "coupon_discount_type_check",
      sql`${table.discountType} in ('percentage', 'fixed_amount')`,
    ),
    check(
      "coupon_discount_percentage_range_check",
      sql`${table.discountType} <> 'percentage' or ${table.discountValue} between 1 and 10000`,
    ),
    check(
      "coupon_period_limit_type_check",
      sql`${table.periodLimitType} is null or ${table.periodLimitType} in ('day', 'week', 'month')`,
    ),
    check(
      "coupon_period_limit_pair_check",
      sql`(${table.periodLimitType} is null and ${table.periodLimitCount} is null) or (${table.periodLimitType} is not null and ${table.periodLimitCount} is not null and ${table.periodLimitCount} > 0)`,
    ),
    check(
      "coupon_max_redemptions_per_customer_positive_check",
      sql`${table.maxRedemptionsPerCustomer} is null or ${table.maxRedemptionsPerCustomer} > 0`,
    ),
    check(
      "coupon_min_eligible_subtotal_non_negative_check",
      sql`${table.minEligibleSubtotalCents} is null or ${table.minEligibleSubtotalCents} >= 0`,
    ),
    check(
      "coupon_max_discount_non_negative_check",
      sql`${table.maxDiscountCents} is null or ${table.maxDiscountCents} >= 0`,
    ),
    check(
      "coupon_validity_range_check",
      sql`${table.endsAt} is null or ${table.endsAt} >= ${table.startsAt}`,
    ),
  ],
);

const couponProductRules = pgTable(
  "coupon_product_rule",
  {
    couponId: text("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "restrict" }),
    mode: text("mode", { enum: COUPON_RULE_MODES }).notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "coupon_product_rule_pk",
      columns: [table.couponId, table.productId],
    }),
    index("coupon_product_rule_coupon_id_idx").on(table.couponId),
    index("coupon_product_rule_product_id_idx").on(table.productId),
    check("coupon_product_rule_mode_check", sql`${table.mode} in ('include', 'exclude')`),
  ],
);

const couponCategoryRules = pgTable(
  "coupon_category_rule",
  {
    couponId: text("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => productCategoriesDB.id, { onDelete: "restrict" }),
    mode: text("mode", { enum: COUPON_RULE_MODES }).notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "coupon_category_rule_pk",
      columns: [table.couponId, table.categoryId],
    }),
    index("coupon_category_rule_coupon_id_idx").on(table.couponId),
    index("coupon_category_rule_category_id_idx").on(table.categoryId),
    check("coupon_category_rule_mode_check", sql`${table.mode} in ('include', 'exclude')`),
  ],
);

const couponPeriodUsages = pgTable(
  "coupon_period_usage",
  {
    couponId: text("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationDB.id, { onDelete: "restrict" }),
    periodType: text("period_type", { enum: COUPON_PERIOD_LIMIT_TYPES }).notNull(),
    periodStartDate: date("period_start_date", { mode: "string" }).notNull(),
    usageCount: integer("usage_count").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "coupon_period_usage_pk",
      columns: [table.couponId, table.organizationId, table.periodType, table.periodStartDate],
    }),
    index("coupon_period_usage_org_period_idx").on(table.organizationId, table.periodStartDate),
    check(
      "coupon_period_usage_period_type_check",
      sql`${table.periodType} in ('day', 'week', 'month')`,
    ),
    check("coupon_period_usage_count_non_negative_check", sql`${table.usageCount} >= 0`),
  ],
);

const couponRedemptions = pgTable(
  "coupon_redemption",
  {
    id: text("id").primaryKey(),
    couponId: text("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "restrict" }),
    orderId: text("order_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationDB.id, { onDelete: "restrict" }),
    customerId: text("customer_id").references(() => customersDB.id, { onDelete: "set null" }),
    codeSnapshot: text("code_snapshot").notNull(),
    discountCents: integer("discount_cents").notNull(),
    periodType: text("period_type", { enum: COUPON_PERIOD_LIMIT_TYPES }),
    periodStartDate: date("period_start_date", { mode: "string" }),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("coupon_redemption_order_id_unique").on(table.orderId),
    index("coupon_redemption_coupon_id_idx").on(table.couponId),
    index("coupon_redemption_customer_id_idx").on(table.customerId),
    index("coupon_redemption_period_idx").on(table.periodType, table.periodStartDate),
    check("coupon_redemption_discount_non_negative_check", sql`${table.discountCents} >= 0`),
    check(
      "coupon_redemption_period_pair_check",
      sql`(${table.periodType} is null and ${table.periodStartDate} is null) or (${table.periodType} is not null and ${table.periodStartDate} is not null)`,
    ),
  ],
);

export const couponsDB = coupons;
export const couponProductRulesDB = couponProductRules;
export const couponCategoryRulesDB = couponCategoryRules;
export const couponPeriodUsagesDB = couponPeriodUsages;
export const couponRedemptionsDB = couponRedemptions;

export const couponsRelations = relations(couponsDB, ({ one, many }) => ({
  organization: one(organizationDB, {
    fields: [couponsDB.organizationId],
    references: [organizationDB.id],
  }),
  productRules: many(couponProductRulesDB),
  categoryRules: many(couponCategoryRulesDB),
  redemptions: many(couponRedemptionsDB),
  periodUsages: many(couponPeriodUsagesDB),
}));

export const couponProductRulesRelations = relations(couponProductRulesDB, ({ one }) => ({
  coupon: one(couponsDB, {
    fields: [couponProductRulesDB.couponId],
    references: [couponsDB.id],
  }),
  product: one(productsDB, {
    fields: [couponProductRulesDB.productId],
    references: [productsDB.id],
  }),
}));

export const couponCategoryRulesRelations = relations(couponCategoryRulesDB, ({ one }) => ({
  coupon: one(couponsDB, {
    fields: [couponCategoryRulesDB.couponId],
    references: [couponsDB.id],
  }),
  category: one(productCategoriesDB, {
    fields: [couponCategoryRulesDB.categoryId],
    references: [productCategoriesDB.id],
  }),
}));

export const couponPeriodUsagesRelations = relations(couponPeriodUsagesDB, ({ one }) => ({
  coupon: one(couponsDB, {
    fields: [couponPeriodUsagesDB.couponId],
    references: [couponsDB.id],
  }),
  organization: one(organizationDB, {
    fields: [couponPeriodUsagesDB.organizationId],
    references: [organizationDB.id],
  }),
}));

export const couponRedemptionsRelations = relations(couponRedemptionsDB, ({ one }) => ({
  coupon: one(couponsDB, {
    fields: [couponRedemptionsDB.couponId],
    references: [couponsDB.id],
  }),
  organization: one(organizationDB, {
    fields: [couponRedemptionsDB.organizationId],
    references: [organizationDB.id],
  }),
  customer: one(customersDB, {
    fields: [couponRedemptionsDB.customerId],
    references: [customersDB.id],
  }),
}));

export type Coupon = typeof couponsDB.$inferSelect;
export type CouponProductRule = typeof couponProductRulesDB.$inferSelect;
export type CouponCategoryRule = typeof couponCategoryRulesDB.$inferSelect;
export type CouponPeriodUsage = typeof couponPeriodUsagesDB.$inferSelect;
export type CouponRedemption = typeof couponRedemptionsDB.$inferSelect;
export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number];
export type CouponPeriodLimitType = (typeof COUPON_PERIOD_LIMIT_TYPES)[number];
export type CouponRuleMode = (typeof COUPON_RULE_MODES)[number];
