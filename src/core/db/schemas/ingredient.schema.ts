import { relations, sql } from "drizzle-orm";
import { check, index, numeric, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { ingredientCategoriesDB } from "./ingredientCategory.schema";
import { unitsDB } from "./unit.schema";

const ingredients = pgTable(
  "ingredient",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    baseUnitId: text("base_unit_id")
      .notNull()
      .references(() => unitsDB.id, { onDelete: "restrict" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => ingredientCategoriesDB.id, { onDelete: "restrict" }),
    baseCostPerUnit: numeric("base_cost_per_unit", { precision: 14, scale: 6, mode: "number" }).notNull(),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [
    check("ingredient_base_cost_per_unit_non_negative_check", sql`${table.baseCostPerUnit} >= 0`),
    uniqueIndex("ingredient_name_active_unique")
      .on(table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    index("ingredient_name_idx").on(table.name),
    index("ingredient_base_unit_id_idx").on(table.baseUnitId),
    index("ingredient_category_id_idx").on(table.categoryId),
  ],
);

export const ingredientsDB = ingredients;
export const ingredientsRelations = relations(ingredientsDB, ({ one }) => ({
  baseUnit: one(unitsDB, {
    fields: [ingredientsDB.baseUnitId],
    references: [unitsDB.id],
  }),
  category: one(ingredientCategoriesDB, {
    fields: [ingredientsDB.categoryId],
    references: [ingredientCategoriesDB.id],
  }),
}));
export type Ingredient = typeof ingredientsDB.$inferSelect;
