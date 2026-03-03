import { relations, sql } from "drizzle-orm";
import { check, index, numeric, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { ingredientsDB } from "./ingredient.schema";
import { productsDB } from "./product.schema";
import { suppliesDB } from "./supply.schema";

const recipes = pgTable("recipe", {
  productId: text("product_id")
    .primaryKey()
    .references(() => productsDB.id, { onDelete: "cascade" }),
  description: text("description"),
  ...generateTimestamps(),
});

const recipeIngredients = pgTable(
  "recipe_ingredient",
  {
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.productId, { onDelete: "cascade" }),
    ingredientId: text("ingredient_id")
      .notNull()
      .references(() => ingredientsDB.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 12, scale: 6, mode: "number" }).notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "recipe_ingredient_pk",
      columns: [table.recipeId, table.ingredientId],
    }),
    check("recipe_ingredient_quantity_positive_check", sql`${table.quantity} > 0`),
    index("recipe_ingredient_recipe_id_idx").on(table.recipeId),
    index("recipe_ingredient_ingredient_id_idx").on(table.ingredientId),
  ],
);

const recipeSupplies = pgTable(
  "recipe_supply",
  {
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.productId, { onDelete: "cascade" }),
    supplyId: text("supply_id")
      .notNull()
      .references(() => suppliesDB.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 12, scale: 6, mode: "number" }).notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "recipe_supply_pk",
      columns: [table.recipeId, table.supplyId],
    }),
    check("recipe_supply_quantity_positive_check", sql`${table.quantity} > 0`),
    index("recipe_supply_recipe_id_idx").on(table.recipeId),
    index("recipe_supply_supply_id_idx").on(table.supplyId),
  ],
);

export const recipesDB = recipes;
export const recipeIngredientsDB = recipeIngredients;
export const recipeSuppliesDB = recipeSupplies;

export const recipesRelations = relations(recipesDB, ({ one, many }) => ({
  product: one(productsDB, {
    fields: [recipesDB.productId],
    references: [productsDB.id],
  }),
  ingredients: many(recipeIngredientsDB),
  supplies: many(recipeSuppliesDB),
}));

export const recipeIngredientsRelations = relations(recipeIngredientsDB, ({ one }) => ({
  recipe: one(recipesDB, {
    fields: [recipeIngredientsDB.recipeId],
    references: [recipesDB.productId],
  }),
  ingredient: one(ingredientsDB, {
    fields: [recipeIngredientsDB.ingredientId],
    references: [ingredientsDB.id],
  }),
}));

export const recipeSuppliesRelations = relations(recipeSuppliesDB, ({ one }) => ({
  recipe: one(recipesDB, {
    fields: [recipeSuppliesDB.recipeId],
    references: [recipesDB.productId],
  }),
  supply: one(suppliesDB, {
    fields: [recipeSuppliesDB.supplyId],
    references: [suppliesDB.id],
  }),
}));

export type Recipe = typeof recipesDB.$inferSelect;
export type RecipeIngredient = typeof recipeIngredientsDB.$inferSelect;
export type RecipeSupply = typeof recipeSuppliesDB.$inferSelect;
