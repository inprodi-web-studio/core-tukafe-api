import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { generateTimestamps, MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
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
    customerId: text("customer_id")
      .notNull()
      .references(() => customersDB.id, { onDelete: "restrict" }),
    folio: text("folio").notNull(),
    comment: text("comment"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxesCents: integer("taxes_cents").notNull().default(0),
    grandTotalCents: integer("grand_total_cents").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("order_organization_folio_unique").on(table.organizationId, table.folio),
    index("order_organization_id_idx").on(table.organizationId),
    index("order_customer_id_idx").on(table.customerId),
    index("order_customer_id_created_at_idx").on(table.customerId, table.createdAt),
    index("order_created_at_idx").on(table.createdAt),
    check("order_folio_format_check", sql`${table.folio} ~ '^(0[1-9]|1[0-2])-[0-9]{2}-[0-9]{6}$'`),
    check("order_subtotal_cents_non_negative_check", sql`${table.subtotalCents} >= 0`),
    check("order_taxes_cents_non_negative_check", sql`${table.taxesCents} >= 0`),
    check("order_grand_total_cents_non_negative_check", sql`${table.grandTotalCents} >= 0`),
    check(
      "order_grand_total_consistency_check",
      sql`${table.grandTotalCents} = ${table.subtotalCents} + ${table.taxesCents}`,
    ),
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
export const orderItemsDB = orderItems;
export const orderItemModifiersDB = orderItemModifiers;
export const orderItemTaxesDB = orderItemTaxes;

export const ordersRelations = relations(ordersDB, ({ one, many }) => ({
  organization: one(organizationDB, {
    fields: [ordersDB.organizationId],
    references: [organizationDB.id],
  }),
  customer: one(customersDB, {
    fields: [ordersDB.customerId],
    references: [customersDB.id],
  }),
  items: many(orderItemsDB),
}));

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
export type OrderItem = typeof orderItemsDB.$inferSelect;
export type OrderItemModifier = typeof orderItemModifiersDB.$inferSelect;
export type OrderItemTax = typeof orderItemTaxesDB.$inferSelect;
