import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text } from "drizzle-orm/pg-core";

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
    // Price stored in minor units (x100): e.g., 12.34 -> 1234.
    baseCost: integer("base_cost").notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    check("ingredient_base_cost_non_negative_check", sql`${table.baseCost} >= 0`),
    index("ingredient_name_idx").on(table.name),
    index("ingredient_unit_id_idx").on(table.unitId),
    index("ingredient_category_id_idx").on(table.categoryId),
  ],
);

export const ingredientsDB = ingredients;
export type Ingredient = typeof ingredientsDB.$inferSelect;
