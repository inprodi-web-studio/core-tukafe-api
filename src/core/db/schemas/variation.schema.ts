import { sql } from "drizzle-orm";
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

const variations = pgTable(
  "variation",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull(),
    kitchenName: text("kitchen_name"),
    customerDescription: text("customer_description"),
    kitchenDescription: text("kitchen_description"),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [
    uniqueIndex("variation_product_name_unique").on(table.productId, table.name),
    check("variation_price_cents_non_negative_check", sql`${table.priceCents} >= 0`),
    index("variation_product_id_idx").on(table.productId),
  ],
);

// Optional override recipe for a variation. If absent, use recipe from base product.
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
export const variationRecipesDB = variationRecipes;
export const variationRecipeIngredientsDB = variationRecipeIngredients;
export const variationRecipeSuppliesDB = variationRecipeSupplies;

export type Variation = typeof variationsDB.$inferSelect;
export type VariationRecipe = typeof variationRecipesDB.$inferSelect;
export type VariationRecipeIngredient = typeof variationRecipeIngredientsDB.$inferSelect;
export type VariationRecipeSupply = typeof variationRecipeSuppliesDB.$inferSelect;
