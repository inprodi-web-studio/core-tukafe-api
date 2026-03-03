import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { ingredientCategoriesDB } from "./ingredientCategory.schema";
import { unitsDB } from "./unit.schema";

const ingredients = pgTable(
  "ingredient",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    unitId: text("unit_id")
      .notNull()
      .references(() => unitsDB.id, { onDelete: "restrict" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => ingredientCategoriesDB.id, { onDelete: "restrict" }),
    baseCostCents: integer("base_cost_cents").notNull(),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [
    check("ingredient_base_cost_non_negative_check", sql`${table.baseCostCents} >= 0`),
    uniqueIndex("ingredient_name_active_unique")
      .on(table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    index("ingredient_name_idx").on(table.name),
    index("ingredient_unit_id_idx").on(table.unitId),
    index("ingredient_category_id_idx").on(table.categoryId),
  ],
);

export const ingredientsDB = ingredients;
export const ingredientsRelations = relations(ingredientsDB, ({ one }) => ({
  unit: one(unitsDB, {
    fields: [ingredientsDB.unitId],
    references: [unitsDB.id],
  }),
  category: one(ingredientCategoriesDB, {
    fields: [ingredientsDB.categoryId],
    references: [ingredientCategoriesDB.id],
  }),
}));
export type Ingredient = typeof ingredientsDB.$inferSelect;
