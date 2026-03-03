import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { ingredientsDB } from "./ingredient.schema";
import { suppliesDB } from "./supply.schema";

const tax = pgTable(
  "tax",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    // Percentage stored as basis points: 1% = 100, 16.5% = 1650, 100% = 10000.
    rate: integer("rate").notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("tax_name_unique").on(table.name),
    check("tax_rate_bps_range_check", sql`${table.rate} >= 0 AND ${table.rate} <= 10000`),
  ],
);

const ingredientTax = pgTable(
  "ingredient_tax",
  {
    ingredientId: text("ingredient_id")
      .notNull()
      .references(() => ingredientsDB.id, { onDelete: "cascade" }),
    taxId: text("tax_id")
      .notNull()
      .references(() => tax.id, { onDelete: "cascade" }),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "ingredient_tax_pk",
      columns: [table.ingredientId, table.taxId],
    }),
    index("ingredient_tax_ingredient_id_idx").on(table.ingredientId),
    index("ingredient_tax_tax_id_idx").on(table.taxId),
  ],
);

const supplyTax = pgTable(
  "supply_tax",
  {
    supplyId: text("supply_id")
      .notNull()
      .references(() => suppliesDB.id, { onDelete: "cascade" }),
    taxId: text("tax_id")
      .notNull()
      .references(() => tax.id, { onDelete: "cascade" }),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "supply_tax_pk",
      columns: [table.supplyId, table.taxId],
    }),
    index("supply_tax_supply_id_idx").on(table.supplyId),
    index("supply_tax_tax_id_idx").on(table.taxId),
  ],
);

export const taxDB = tax;
export const ingredientTaxDB = ingredientTax;
export const supplyTaxDB = supplyTax;

export type Tax = typeof taxDB.$inferSelect;
export type IngredientTax = typeof ingredientTaxDB.$inferSelect;
export type SupplyTax = typeof supplyTaxDB.$inferSelect;
