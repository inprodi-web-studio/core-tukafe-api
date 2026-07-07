import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { generateTimestamps, MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { couponsDB } from "./coupon.schema";
import { customersDB } from "./customer.schema";
import { modifierOptionsDB, modifiersDB } from "./modifier.schema";
import { organizationDB } from "./organization.schema";
import { productsDB } from "./product.schema";
import { taxDB } from "./tax.schema";
import { unitsDB } from "./unit.schema";
import { variationsDB } from "./variation.schema";

const orders = pgTable(
  "order",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationDB.id, { onDelete: "restrict" }),
    customerId: text("customer_id").references(() => customersDB.id, { onDelete: "restrict" }),
    couponId: text("coupon_id").references(() => couponsDB.id, { onDelete: "restrict" }),
    couponCode: text("coupon_code"),
    folio: text("folio").notNull(),
    comment: text("comment"),
    tipType: text("tip_type", { enum: ["none", "percentage", "amount"] })
      .notNull()
      .default("none"),
    tipRateBps: integer("tip_rate_bps"),
    tipCents: integer("tip_cents").notNull().default(0),
    promotionDiscountCents: integer("promotion_discount_cents").notNull().default(0),
    couponDiscountCents: integer("coupon_discount_cents").notNull().default(0),
    cashbackRedemptionCents: integer("cashback_redemption_cents").notNull().default(0),
    cashbackEarnedCents: integer("cashback_earned_cents").notNull().default(0),
    cashbackEligiblePaidCents: integer("cashback_eligible_paid_cents").notNull().default(0),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxesCents: integer("taxes_cents").notNull().default(0),
    grandTotalCents: integer("grand_total_cents").notNull().default(0),
    amountDueCents: integer("amount_due_cents").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("order_organization_folio_unique").on(table.organizationId, table.folio),
    index("order_organization_id_idx").on(table.organizationId),
    index("order_customer_id_idx").on(table.customerId),
    index("order_coupon_id_idx").on(table.couponId),
    index("order_customer_id_created_at_idx").on(table.customerId, table.createdAt),
    index("order_created_at_idx").on(table.createdAt),
    check("order_folio_format_check", sql`${table.folio} ~ '^(0[1-9]|1[0-2])-[0-9]{2}-[0-9]{6}$'`),
    check("order_subtotal_cents_non_negative_check", sql`${table.subtotalCents} >= 0`),
    check("order_taxes_cents_non_negative_check", sql`${table.taxesCents} >= 0`),
    check("order_tip_cents_non_negative_check", sql`${table.tipCents} >= 0`),
    check(
      "order_promotion_discount_cents_non_negative_check",
      sql`${table.promotionDiscountCents} >= 0`,
    ),
    check("order_coupon_discount_cents_non_negative_check", sql`${table.couponDiscountCents} >= 0`),
    check(
      "order_cashback_redemption_cents_non_negative_check",
      sql`${table.cashbackRedemptionCents} >= 0`,
    ),
    check("order_cashback_earned_cents_non_negative_check", sql`${table.cashbackEarnedCents} >= 0`),
    check(
      "order_cashback_eligible_paid_cents_non_negative_check",
      sql`${table.cashbackEligiblePaidCents} >= 0`,
    ),
    check("order_tip_type_check", sql`${table.tipType} in ('none', 'percentage', 'amount')`),
    check(
      "order_tip_type_rate_consistency_check",
      sql`(${table.tipType} = 'percentage' and ${table.tipRateBps} is not null and ${table.tipRateBps} between 1 and 10000) or (${table.tipType} <> 'percentage' and ${table.tipRateBps} is null)`,
    ),
    check(
      "order_tip_type_amount_consistency_check",
      sql`(${table.tipType} = 'none' and ${table.tipCents} = 0) or (${table.tipType} <> 'none' and ${table.tipCents} >= 0)`,
    ),
    check("order_grand_total_cents_non_negative_check", sql`${table.grandTotalCents} >= 0`),
    check("order_amount_due_cents_non_negative_check", sql`${table.amountDueCents} >= 0`),
    check(
      "order_cashback_redemption_lte_grand_total_check",
      sql`${table.cashbackRedemptionCents} <= ${table.grandTotalCents}`,
    ),
    check(
      "order_grand_total_consistency_check",
      sql`${table.grandTotalCents} = ${table.subtotalCents} + ${table.taxesCents} + ${table.tipCents}`,
    ),
    check(
      "order_amount_due_cashback_consistency_check",
      sql`${table.amountDueCents} = ${table.grandTotalCents} - ${table.cashbackRedemptionCents}`,
    ),
  ],
);

const orderPaymentAttempts = pgTable(
  "order_payment_attempt",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationDB.id, { onDelete: "restrict" }),
    customerId: text("customer_id").references(() => customersDB.id, { onDelete: "set null" }),
    orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
    provider: text("provider").notNull().default("zettle"),
    reference: text("reference").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("MXN"),
    status: text("status").notNull().default("pending"),
    transactionId: text("transaction_id"),
    referenceNumber: text("reference_number"),
    cardBrand: text("card_brand"),
    entryMode: text("entry_mode"),
    authorizationCode: text("authorization_code"),
    obfuscatedPan: text("obfuscated_pan"),
    orderPayload: jsonb("order_payload").$type<Record<string, unknown> | null>(),
    rawResponse: jsonb("raw_response").$type<Record<string, unknown> | null>(),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("order_payment_attempt_reference_unique").on(table.reference),
    uniqueIndex("order_payment_attempt_transaction_id_unique").on(table.transactionId),
    index("order_payment_attempt_organization_status_created_at_idx").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    index("order_payment_attempt_order_id_idx").on(table.orderId),
    index("order_payment_attempt_customer_id_idx").on(table.customerId),
    check("order_payment_attempt_provider_check", sql`${table.provider} in ('zettle', 'stripe')`),
    check(
      "order_payment_attempt_status_check",
      sql`${table.status} in ('pending', 'paid_unlinked', 'completed', 'cancelled', 'failed', 'requires_reconciliation')`,
    ),
    check("order_payment_attempt_amount_positive_check", sql`${table.amountCents} > 0`),
    check("order_payment_attempt_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

const orderItems = pgTable(
  "order_item",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "restrict" }),
    variationId: text("variation_id").references(() => variationsDB.id, {
      onDelete: "restrict",
    }),
    unitId: text("unit_id")
      .notNull()
      .references(() => unitsDB.id, { onDelete: "restrict" }),
    productName: text("product_name").notNull(),
    variationName: text("variation_name"),
    unitName: text("unit_name").notNull(),
    unitAbbreviation: text("unit_abbreviation").notNull(),
    unitPrecision: integer("unit_precision").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 6, mode: "number" }).notNull(),
    comment: text("comment"),
    unitPriceCents: integer("unit_price_cents").notNull(),
    modifiersSubtotalCents: integer("modifiers_subtotal_cents").notNull().default(0),
    freeUnits: integer("free_units").notNull().default(0),
    promotionCode: text("promotion_code"),
    promotionDiscountCents: integer("promotion_discount_cents").notNull().default(0),
    couponDiscountCents: integer("coupon_discount_cents").notNull().default(0),
    subtotalCents: integer("subtotal_cents").notNull(),
    taxesCents: integer("taxes_cents").notNull(),
    grandTotalCents: integer("grand_total_cents").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("order_item_order_sort_order_unique").on(table.orderId, table.sortOrder),
    index("order_item_order_id_idx").on(table.orderId),
    index("order_item_product_id_idx").on(table.productId),
    index("order_item_variation_id_idx").on(table.variationId),
    index("order_item_unit_id_idx").on(table.unitId),
    check("order_item_quantity_positive_check", sql`${table.quantity} > 0`),
    check("order_item_unit_precision_non_negative_check", sql`${table.unitPrecision} >= 0`),
    check(
      "order_item_unit_precision_max_supported_check",
      sql`${table.unitPrecision} <= ${sql.raw(String(MAX_SUPPORTED_DECIMAL_PLACES))}`,
    ),
    check("order_item_unit_price_cents_non_negative_check", sql`${table.unitPriceCents} >= 0`),
    check(
      "order_item_modifiers_subtotal_cents_non_negative_check",
      sql`${table.modifiersSubtotalCents} >= 0`,
    ),
    check("order_item_free_units_non_negative_check", sql`${table.freeUnits} >= 0`),
    check(
      "order_item_promotion_discount_cents_non_negative_check",
      sql`${table.promotionDiscountCents} >= 0`,
    ),
    check(
      "order_item_coupon_discount_cents_non_negative_check",
      sql`${table.couponDiscountCents} >= 0`,
    ),
    check("order_item_subtotal_cents_non_negative_check", sql`${table.subtotalCents} >= 0`),
    check("order_item_taxes_cents_non_negative_check", sql`${table.taxesCents} >= 0`),
    check("order_item_grand_total_cents_non_negative_check", sql`${table.grandTotalCents} >= 0`),
    check(
      "order_item_grand_total_consistency_check",
      sql`${table.grandTotalCents} = ${table.subtotalCents} + ${table.taxesCents}`,
    ),
    check("order_item_sort_order_non_negative_check", sql`${table.sortOrder} >= 0`),
  ],
);

const customerOrderPromotionStates = pgTable(
  "customer_order_promotion_state",
  {
    customerId: text("customer_id")
      .primaryKey()
      .references(() => customersDB.id, { onDelete: "cascade" }),
    progressCount: integer("progress_count").notNull().default(0),
    candidateProductIds: text("candidate_product_ids")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    legacyFreeDrinkGrantedAt: timestamp("legacy_free_drink_granted_at", { mode: "date" }),
    legacyFreeDrinkRedeemedAt: timestamp("legacy_free_drink_redeemed_at", { mode: "date" }),
    version: integer("version").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    index("customer_order_promotion_state_updated_at_idx").on(table.updatedAt),
    check(
      "customer_order_promotion_state_progress_count_range_check",
      sql`${table.progressCount} >= 0 AND ${table.progressCount} <= 4`,
    ),
  ],
);

const orderItemModifiers = pgTable(
  "order_item_modifier",
  {
    id: text("id").primaryKey(),
    orderItemId: text("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    modifierId: text("modifier_id")
      .notNull()
      .references(() => modifiersDB.id, { onDelete: "restrict" }),
    modifierOptionId: text("modifier_option_id")
      .notNull()
      .references(() => modifierOptionsDB.id, { onDelete: "restrict" }),
    modifierName: text("modifier_name").notNull(),
    modifierOptionName: text("modifier_option_name").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 6, mode: "number" }).notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull().default(0),
    totalPriceCents: integer("total_price_cents").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("order_item_modifier_item_option_unique").on(
      table.orderItemId,
      table.modifierOptionId,
    ),
    index("order_item_modifier_order_item_id_idx").on(table.orderItemId),
    index("order_item_modifier_modifier_id_idx").on(table.modifierId),
    index("order_item_modifier_modifier_option_id_idx").on(table.modifierOptionId),
    check("order_item_modifier_quantity_positive_check", sql`${table.quantity} > 0`),
    check(
      "order_item_modifier_unit_price_cents_non_negative_check",
      sql`${table.unitPriceCents} >= 0`,
    ),
    check(
      "order_item_modifier_total_price_cents_non_negative_check",
      sql`${table.totalPriceCents} >= 0`,
    ),
    check("order_item_modifier_sort_order_non_negative_check", sql`${table.sortOrder} >= 0`),
  ],
);

export interface OrderItemCompoundComponentSnapshot {
  modifierId: string;
  modifierName: string;
  modifierKitchenName: string | null;
  modifierOptionId: string;
  modifierOptionName: string;
  modifierOptionKitchenName: string | null;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
}

export interface OrderItemCompoundComponentVariationSelectionSnapshot {
  groupId: string;
  groupName: string;
  groupCustomerLabel: string | null;
  optionId: string;
  optionName: string;
  optionKitchenName?: string | null;
}

const orderItemCompoundComponents = pgTable(
  "order_item_compound_component",
  {
    id: text("id").primaryKey(),
    orderItemId: text("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    compoundProductId: text("compound_product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "restrict" }),
    slotId: text("slot_id"),
    slotOptionId: text("slot_option_id"),
    slotLabel: text("slot_label"),
    componentProductId: text("component_product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "restrict" }),
    variationId: text("variation_id").references(() => variationsDB.id, {
      onDelete: "restrict",
    }),
    componentLabel: text("component_label"),
    productName: text("product_name").notNull(),
    productKitchenName: text("product_kitchen_name"),
    variationName: text("variation_name"),
    variationSelectionsSnapshot: jsonb("variation_selections_snapshot")
      .$type<OrderItemCompoundComponentVariationSelectionSnapshot[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    modifiersSnapshot: jsonb("modifiers_snapshot")
      .$type<OrderItemCompoundComponentSnapshot[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    quantity: integer("quantity").notNull().default(1),
    modifiersSubtotalCents: integer("modifiers_subtotal_cents").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("order_item_compound_component_item_sort_order_unique").on(
      table.orderItemId,
      table.sortOrder,
    ),
    index("order_item_compound_component_order_item_id_idx").on(table.orderItemId),
    index("order_item_compound_component_compound_product_id_idx").on(table.compoundProductId),
    index("order_item_compound_component_component_product_id_idx").on(table.componentProductId),
    index("order_item_compound_component_variation_id_idx").on(table.variationId),
    check("order_item_compound_component_quantity_positive_check", sql`${table.quantity} > 0`),
    check(
      "order_item_compound_component_modifiers_subtotal_non_negative_check",
      sql`${table.modifiersSubtotalCents} >= 0`,
    ),
    check(
      "order_item_compound_component_sort_order_non_negative_check",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

const orderItemTaxes = pgTable(
  "order_item_tax",
  {
    orderItemId: text("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    taxId: text("tax_id")
      .notNull()
      .references(() => taxDB.id, { onDelete: "restrict" }),
    taxName: text("tax_name").notNull(),
    // Percentage stored as basis points: 1% = 100, 16.5% = 1650, 100% = 10000.
    taxRate: integer("tax_rate").notNull(),
    taxAmountCents: integer("tax_amount_cents").notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "order_item_tax_pk",
      columns: [table.orderItemId, table.taxId],
    }),
    index("order_item_tax_order_item_id_idx").on(table.orderItemId),
    index("order_item_tax_tax_id_idx").on(table.taxId),
    check(
      "order_item_tax_rate_bps_range_check",
      sql`${table.taxRate} >= 0 AND ${table.taxRate} <= 10000`,
    ),
    check("order_item_tax_amount_cents_non_negative_check", sql`${table.taxAmountCents} >= 0`),
  ],
);

export const ordersDB = orders;
export const orderPaymentAttemptsDB = orderPaymentAttempts;
export const orderItemsDB = orderItems;
export const orderItemModifiersDB = orderItemModifiers;
export const orderItemCompoundComponentsDB = orderItemCompoundComponents;
export const orderItemTaxesDB = orderItemTaxes;
export const customerOrderPromotionStatesDB = customerOrderPromotionStates;

export const ordersRelations = relations(ordersDB, ({ one, many }) => ({
  organization: one(organizationDB, {
    fields: [ordersDB.organizationId],
    references: [organizationDB.id],
  }),
  customer: one(customersDB, {
    fields: [ordersDB.customerId],
    references: [customersDB.id],
  }),
  coupon: one(couponsDB, {
    fields: [ordersDB.couponId],
    references: [couponsDB.id],
  }),
  paymentAttempts: many(orderPaymentAttemptsDB),
  items: many(orderItemsDB),
}));

export const orderPaymentAttemptsRelations = relations(orderPaymentAttemptsDB, ({ one }) => ({
  organization: one(organizationDB, {
    fields: [orderPaymentAttemptsDB.organizationId],
    references: [organizationDB.id],
  }),
  customer: one(customersDB, {
    fields: [orderPaymentAttemptsDB.customerId],
    references: [customersDB.id],
  }),
  order: one(ordersDB, {
    fields: [orderPaymentAttemptsDB.orderId],
    references: [ordersDB.id],
  }),
}));

export const customerOrderPromotionStatesRelations = relations(
  customerOrderPromotionStatesDB,
  ({ one }) => ({
    customer: one(customersDB, {
      fields: [customerOrderPromotionStatesDB.customerId],
      references: [customersDB.id],
    }),
  }),
);

export const orderItemsRelations = relations(orderItemsDB, ({ one, many }) => ({
  order: one(ordersDB, {
    fields: [orderItemsDB.orderId],
    references: [ordersDB.id],
  }),
  product: one(productsDB, {
    fields: [orderItemsDB.productId],
    references: [productsDB.id],
  }),
  variation: one(variationsDB, {
    fields: [orderItemsDB.variationId],
    references: [variationsDB.id],
  }),
  unit: one(unitsDB, {
    fields: [orderItemsDB.unitId],
    references: [unitsDB.id],
  }),
  modifiers: many(orderItemModifiersDB),
  compoundComponents: many(orderItemCompoundComponentsDB),
  taxes: many(orderItemTaxesDB),
}));

export const orderItemModifiersRelations = relations(orderItemModifiersDB, ({ one }) => ({
  orderItem: one(orderItemsDB, {
    fields: [orderItemModifiersDB.orderItemId],
    references: [orderItemsDB.id],
  }),
  modifier: one(modifiersDB, {
    fields: [orderItemModifiersDB.modifierId],
    references: [modifiersDB.id],
  }),
  modifierOption: one(modifierOptionsDB, {
    fields: [orderItemModifiersDB.modifierOptionId],
    references: [modifierOptionsDB.id],
  }),
}));

export const orderItemCompoundComponentsRelations = relations(
  orderItemCompoundComponentsDB,
  ({ one }) => ({
    orderItem: one(orderItemsDB, {
      fields: [orderItemCompoundComponentsDB.orderItemId],
      references: [orderItemsDB.id],
    }),
    compoundProduct: one(productsDB, {
      fields: [orderItemCompoundComponentsDB.compoundProductId],
      references: [productsDB.id],
    }),
    componentProduct: one(productsDB, {
      fields: [orderItemCompoundComponentsDB.componentProductId],
      references: [productsDB.id],
    }),
    variation: one(variationsDB, {
      fields: [orderItemCompoundComponentsDB.variationId],
      references: [variationsDB.id],
    }),
  }),
);

export const orderItemTaxesRelations = relations(orderItemTaxesDB, ({ one }) => ({
  orderItem: one(orderItemsDB, {
    fields: [orderItemTaxesDB.orderItemId],
    references: [orderItemsDB.id],
  }),
  tax: one(taxDB, {
    fields: [orderItemTaxesDB.taxId],
    references: [taxDB.id],
  }),
}));

export type Order = typeof ordersDB.$inferSelect;
export type OrderPaymentAttempt = typeof orderPaymentAttemptsDB.$inferSelect;
export type OrderItem = typeof orderItemsDB.$inferSelect;
export type OrderItemModifier = typeof orderItemModifiersDB.$inferSelect;
export type OrderItemCompoundComponent = typeof orderItemCompoundComponentsDB.$inferSelect;
export type OrderItemTax = typeof orderItemTaxesDB.$inferSelect;
export type CustomerOrderPromotionState = typeof customerOrderPromotionStatesDB.$inferSelect;
