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

import { generateTimestamps } from "@core/utils";
import { ingredientsDB } from "./ingredient.schema";
import { productsDB } from "./product.schema";
import { suppliesDB } from "./supply.schema";

const variationGroups = pgTable(
  "variation_group",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("variation_group_name_unique").on(table.name),
    uniqueIndex("variation_group_sort_order_unique").on(table.sortOrder),
    check("variation_group_sort_order_non_negative_check", sql`${table.sortOrder} >= 0`),
  ],
);

const variationGroupOptions = pgTable(
  "variation_group_option",
  {
    id: text("id").primaryKey(),
    variationGroupId: text("variation_group_id")
      .notNull()
      .references(() => variationGroups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("variation_group_option_group_name_unique").on(table.variationGroupId, table.name),
    uniqueIndex("variation_group_option_group_sort_order_unique").on(
      table.variationGroupId,
      table.sortOrder,
    ),
    check("variation_group_option_sort_order_non_negative_check", sql`${table.sortOrder} >= 0`),
    index("variation_group_option_group_id_idx").on(table.variationGroupId),
  ],
);

const productVariationGroups = pgTable(
  "product_variation_group",
  {
    productId: text("product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "cascade" }),
    variationGroupId: text("variation_group_id")
      .notNull()
      .references(() => variationGroups.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "product_variation_group_pk",
      columns: [table.productId, table.variationGroupId],
    }),
    uniqueIndex("product_variation_group_product_sort_order_unique").on(
      table.productId,
      table.sortOrder,
    ),
    check("product_variation_group_sort_order_non_negative_check", sql`${table.sortOrder} >= 0`),
    index("product_variation_group_product_id_idx").on(table.productId),
    index("product_variation_group_group_id_idx").on(table.variationGroupId),
  ],
);

const variations = pgTable(
  "variation",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "cascade" }),
    combinationKey: text("combination_key").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    priceCents: integer("price_cents").notNull(),
    kitchenName: text("kitchen_name"),
    customerDescription: text("customer_description"),
    kitchenDescription: text("kitchen_description"),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [
    uniqueIndex("variation_product_combination_key_active_unique")
      .on(table.productId, table.combinationKey)
      .where(sql`${table.deletedAt} IS NULL`),
    check("variation_price_cents_non_negative_check", sql`${table.priceCents} >= 0`),
    check("variation_sort_order_non_negative_check", sql`${table.sortOrder} >= 0`),
    index("variation_product_id_idx").on(table.productId),
    index("variation_product_sort_order_idx").on(table.productId, table.sortOrder),
  ],
);

const variationSelections = pgTable(
  "variation_selection",
  {
    variationId: text("variation_id")
      .notNull()
      .references(() => variations.id, { onDelete: "cascade" }),
    variationGroupId: text("variation_group_id")
      .notNull()
      .references(() => variationGroups.id, { onDelete: "cascade" }),
    variationOptionId: text("variation_option_id")
      .notNull()
      .references(() => variationGroupOptions.id, { onDelete: "cascade" }),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "variation_selection_pk",
      columns: [table.variationId, table.variationGroupId],
    }),
    index("variation_selection_variation_id_idx").on(table.variationId),
    index("variation_selection_group_id_idx").on(table.variationGroupId),
    index("variation_selection_option_id_idx").on(table.variationOptionId),
  ],
);

const variationRecipes = pgTable("variation_recipe", {
  variationId: text("variation_id")
    .primaryKey()
    .references(() => variations.id, { onDelete: "cascade" }),
  description: text("description"),
  ...generateTimestamps(),
});

const variationRecipeIngredients = pgTable(
  "variation_recipe_ingredient",
  {
    variationId: text("variation_id")
      .notNull()
      .references(() => variationRecipes.variationId, { onDelete: "cascade" }),
    ingredientId: text("ingredient_id")
      .notNull()
      .references(() => ingredientsDB.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 12, scale: 6, mode: "number" }).notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "variation_recipe_ingredient_pk",
      columns: [table.variationId, table.ingredientId],
    }),
    check("variation_recipe_ingredient_quantity_positive_check", sql`${table.quantity} > 0`),
    index("variation_recipe_ingredient_variation_id_idx").on(table.variationId),
    index("variation_recipe_ingredient_ingredient_id_idx").on(table.ingredientId),
  ],
);

const variationRecipeSupplies = pgTable(
  "variation_recipe_supply",
  {
    variationId: text("variation_id")
      .notNull()
      .references(() => variationRecipes.variationId, { onDelete: "cascade" }),
    supplyId: text("supply_id")
      .notNull()
      .references(() => suppliesDB.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 12, scale: 6, mode: "number" }).notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "variation_recipe_supply_pk",
      columns: [table.variationId, table.supplyId],
    }),
    check("variation_recipe_supply_quantity_positive_check", sql`${table.quantity} > 0`),
    index("variation_recipe_supply_variation_id_idx").on(table.variationId),
    index("variation_recipe_supply_supply_id_idx").on(table.supplyId),
  ],
);

export const variationsDB = variations;
export const variationGroupsDB = variationGroups;
export const variationGroupOptionsDB = variationGroupOptions;
export const productVariationGroupsDB = productVariationGroups;
export const variationSelectionsDB = variationSelections;
export const variationRecipesDB = variationRecipes;
export const variationRecipeIngredientsDB = variationRecipeIngredients;
export const variationRecipeSuppliesDB = variationRecipeSupplies;

export const variationsRelations = relations(variationsDB, ({ one, many }) => ({
  product: one(productsDB, {
    fields: [variationsDB.productId],
    references: [productsDB.id],
  }),
  selections: many(variationSelectionsDB),
  recipe: one(variationRecipesDB, {
    fields: [variationsDB.id],
    references: [variationRecipesDB.variationId],
  }),
}));

export const variationGroupsRelations = relations(variationGroupsDB, ({ many }) => ({
  options: many(variationGroupOptionsDB),
  productLinks: many(productVariationGroupsDB),
  selections: many(variationSelectionsDB),
}));

export const variationGroupOptionsRelations = relations(
  variationGroupOptionsDB,
  ({ one, many }) => ({
    group: one(variationGroupsDB, {
      fields: [variationGroupOptionsDB.variationGroupId],
      references: [variationGroupsDB.id],
    }),
    selections: many(variationSelectionsDB),
  }),
);

export const productVariationGroupsRelations = relations(productVariationGroupsDB, ({ one }) => ({
  product: one(productsDB, {
    fields: [productVariationGroupsDB.productId],
    references: [productsDB.id],
  }),
  group: one(variationGroupsDB, {
    fields: [productVariationGroupsDB.variationGroupId],
    references: [variationGroupsDB.id],
  }),
}));

export const variationSelectionsRelations = relations(variationSelectionsDB, ({ one }) => ({
  variation: one(variationsDB, {
    fields: [variationSelectionsDB.variationId],
    references: [variationsDB.id],
  }),
  group: one(variationGroupsDB, {
    fields: [variationSelectionsDB.variationGroupId],
    references: [variationGroupsDB.id],
  }),
  option: one(variationGroupOptionsDB, {
    fields: [variationSelectionsDB.variationOptionId],
    references: [variationGroupOptionsDB.id],
  }),
}));

export const variationRecipesRelations = relations(variationRecipesDB, ({ one, many }) => ({
  variation: one(variationsDB, {
    fields: [variationRecipesDB.variationId],
    references: [variationsDB.id],
  }),
  ingredients: many(variationRecipeIngredientsDB),
  supplies: many(variationRecipeSuppliesDB),
}));

export const variationRecipeIngredientsRelations = relations(
  variationRecipeIngredientsDB,
  ({ one }) => ({
    recipe: one(variationRecipesDB, {
      fields: [variationRecipeIngredientsDB.variationId],
      references: [variationRecipesDB.variationId],
    }),
    ingredient: one(ingredientsDB, {
      fields: [variationRecipeIngredientsDB.ingredientId],
      references: [ingredientsDB.id],
    }),
  }),
);

export const variationRecipeSuppliesRelations = relations(variationRecipeSuppliesDB, ({ one }) => ({
  recipe: one(variationRecipesDB, {
    fields: [variationRecipeSuppliesDB.variationId],
    references: [variationRecipesDB.variationId],
  }),
  supply: one(suppliesDB, {
    fields: [variationRecipeSuppliesDB.supplyId],
    references: [suppliesDB.id],
  }),
}));

export type Variation = typeof variationsDB.$inferSelect;
export type VariationGroup = typeof variationGroupsDB.$inferSelect;
export type VariationGroupOption = typeof variationGroupOptionsDB.$inferSelect;
export type ProductVariationGroup = typeof productVariationGroupsDB.$inferSelect;
export type VariationSelection = typeof variationSelectionsDB.$inferSelect;
export type VariationRecipe = typeof variationRecipesDB.$inferSelect;
export type VariationRecipeIngredient = typeof variationRecipeIngredientsDB.$inferSelect;
export type VariationRecipeSupply = typeof variationRecipeSuppliesDB.$inferSelect;
