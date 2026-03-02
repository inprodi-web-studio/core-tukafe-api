import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { supplyCategoriesDB } from "./supplyCategory.schema";
import { unitsDB } from "./unit.schema";

const supplies = pgTable(
  "supply",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    // Price stored in minor units (x100): e.g., 12.34 -> 1234.
    baseCost: integer("base_cost").notNull(),
    unitId: text("unit_id")
      .notNull()
      .references(() => unitsDB.id, { onDelete: "restrict" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => supplyCategoriesDB.id, { onDelete: "restrict" }),
    ...generateTimestamps(),
  },
  (table) => [
    check("supply_base_cost_non_negative_check", sql`${table.baseCost} >= 0`),
    index("supply_name_idx").on(table.name),
    index("supply_unit_id_idx").on(table.unitId),
    index("supply_category_id_idx").on(table.categoryId),
  ],
);

export const suppliesDB = supplies;
export type Supply = typeof suppliesDB.$inferSelect;
