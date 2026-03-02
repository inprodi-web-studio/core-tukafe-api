import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { ingredientsDB } from "./ingredient.schema";
import { productsDB } from "./product.schema";
import { suppliesDB } from "./supply.schema";

const modifiers = pgTable(
  "modifier",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kitchenName: text("kitchen_name"),
    customerLabel: text("customer_label"),
    multiSelect: boolean("multi_select").notNull().default(false),
    minSelect: integer("min_select").notNull().default(0),
    maxSelect: integer("max_select"),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("modifier_name_unique").on(table.name),
    check("modifier_min_select_non_negative_check", sql`${table.minSelect} >= 0`),
    check(
      "modifier_max_select_ge_min_select_check",
      sql`${table.maxSelect} IS NULL OR ${table.maxSelect} >= ${table.minSelect}`,
    ),
    check(
      "modifier_single_select_min_limit_check",
      sql`${table.multiSelect} OR ${table.minSelect} <= 1`,
    ),
    check(
      "modifier_single_select_max_limit_check",
      sql`${table.multiSelect} OR ${table.maxSelect} IS NULL OR ${table.maxSelect} <= 1`,
    ),
  ],
);

const modifierOptions = pgTable(
  "modifier_option",
  {
    id: text("id").primaryKey(),
    modifierId: text("modifier_id")
      .notNull()
      .references(() => modifiers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kitchenName: text("kitchen_name"),
    customerName: text("customer_name"),
    priceCents: integer("price_cents").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("modifier_option_modifier_name_unique").on(table.modifierId, table.name),
    uniqueIndex("modifier_option_single_default_unique")
      .on(table.modifierId)
      .where(sql`${table.isDefault} = true`),
    check("modifier_option_price_cents_non_negative_check", sql`${table.priceCents} >= 0`),
    check("modifier_option_sort_order_non_negative_check", sql`${table.sortOrder} >= 0`),
    index("modifier_option_modifier_id_idx").on(table.modifierId),
    index("modifier_option_modifier_id_sort_order_idx").on(table.modifierId, table.sortOrder),
  ],
);

const productModifiers = pgTable(
  "product_modifier",
  {
    productId: text("product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "cascade" }),
    modifierId: text("modifier_id")
      .notNull()
      .references(() => modifiers.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "product_modifier_pk",
      columns: [table.productId, table.modifierId],
    }),
    uniqueIndex("product_modifier_product_sort_order_unique").on(table.productId, table.sortOrder),
    check("product_modifier_sort_order_non_negative_check", sql`${table.sortOrder} >= 0`),
    index("product_modifier_product_id_idx").on(table.productId),
    index("product_modifier_modifier_id_idx").on(table.modifierId),
  ],
);

const modifierOptionIngredients = pgTable(
  "modifier_option_ingredient",
  {
    modifierOptionId: text("modifier_option_id")
      .notNull()
      .references(() => modifierOptions.id, { onDelete: "cascade" }),
    ingredientId: text("ingredient_id")
      .notNull()
      .references(() => ingredientsDB.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "modifier_option_ingredient_pk",
      columns: [table.modifierOptionId, table.ingredientId],
    }),
    check("modifier_option_ingredient_quantity_positive_check", sql`${table.quantity} > 0`),
    index("modifier_option_ingredient_modifier_option_id_idx").on(table.modifierOptionId),
    index("modifier_option_ingredient_ingredient_id_idx").on(table.ingredientId),
  ],
);

const modifierOptionSupplies = pgTable(
  "modifier_option_supply",
  {
    modifierOptionId: text("modifier_option_id")
      .notNull()
      .references(() => modifierOptions.id, { onDelete: "cascade" }),
    supplyId: text("supply_id")
      .notNull()
      .references(() => suppliesDB.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "modifier_option_supply_pk",
      columns: [table.modifierOptionId, table.supplyId],
    }),
    check("modifier_option_supply_quantity_positive_check", sql`${table.quantity} > 0`),
    index("modifier_option_supply_modifier_option_id_idx").on(table.modifierOptionId),
    index("modifier_option_supply_supply_id_idx").on(table.supplyId),
  ],
);

export const modifiersDB = modifiers;
export const modifierOptionsDB = modifierOptions;
export const productModifiersDB = productModifiers;
export const modifierOptionIngredientsDB = modifierOptionIngredients;
export const modifierOptionSuppliesDB = modifierOptionSupplies;

export type Modifier = typeof modifiersDB.$inferSelect;
export type ModifierOption = typeof modifierOptionsDB.$inferSelect;
export type ProductModifier = typeof productModifiersDB.$inferSelect;
export type ModifierOptionIngredient = typeof modifierOptionIngredientsDB.$inferSelect;
export type ModifierOptionSupply = typeof modifierOptionSuppliesDB.$inferSelect;
