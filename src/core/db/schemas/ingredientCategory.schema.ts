import { sql } from "drizzle-orm";
import { check, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";

const ingredientCategories = pgTable(
  "ingredient_category",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    icon: text("icon").notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("ingredient_category_name_unique").on(table.name),
    check("ingredient_category_color_hex_check", sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
  ],
);

export const ingredientCategoriesDB = ingredientCategories;
export type IngredientCategory = typeof ingredientCategoriesDB.$inferSelect;
