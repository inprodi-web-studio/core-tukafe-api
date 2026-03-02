import { sql } from "drizzle-orm";
import { check, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";

const supplyCategories = pgTable(
  "supply_category",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("supply_category_name_unique").on(table.name),
    check("supply_category_color_hex_check", sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
  ],
);

export const supplyCategoriesDB = supplyCategories;
export type SupplyCategory = typeof supplyCategoriesDB.$inferSelect;
