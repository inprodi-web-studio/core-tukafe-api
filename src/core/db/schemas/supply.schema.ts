import { relations, sql } from "drizzle-orm";
import { check, index, numeric, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { supplyCategoriesDB } from "./supplyCategory.schema";
import { unitsDB } from "./unit.schema";

const supplies = pgTable(
  "supply",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    baseUnitId: text("base_unit_id")
      .notNull()
      .references(() => unitsDB.id, { onDelete: "restrict" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => supplyCategoriesDB.id, { onDelete: "restrict" }),
    baseCostPerUnit: numeric("base_cost_per_unit", {
      precision: 14,
      scale: 6,
      mode: "number",
    }).notNull(),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [
    check("supply_base_cost_per_unit_non_negative_check", sql`${table.baseCostPerUnit} >= 0`),
    uniqueIndex("supply_name_active_unique")
      .on(table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    index("supply_name_idx").on(table.name),
    index("supply_base_unit_id_idx").on(table.baseUnitId),
    index("supply_category_id_idx").on(table.categoryId),
  ],
);

export const suppliesDB = supplies;
export const suppliesRelations = relations(suppliesDB, ({ one }) => ({
  baseUnit: one(unitsDB, {
    fields: [suppliesDB.baseUnitId],
    references: [unitsDB.id],
  }),
  category: one(supplyCategoriesDB, {
    fields: [suppliesDB.categoryId],
    references: [supplyCategoriesDB.id],
  }),
}));
export type Supply = typeof suppliesDB.$inferSelect;
