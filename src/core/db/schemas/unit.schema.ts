import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps, MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";

const units = pgTable(
  "unit",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    abbreviation: text("abbreviation").notNull(),
    precision: integer("precision").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("unit_name_unique").on(table.name),
    uniqueIndex("unit_abbreviation_unique").on(table.abbreviation),
    check("unit_precision_non_negative_check", sql`${table.precision} >= 0`),
    check(
      "unit_precision_max_supported_check",
      sql`${table.precision} <= ${sql.raw(String(MAX_SUPPORTED_DECIMAL_PLACES))}`,
    ),
  ],
);

export const unitsDB = units;
export type Unit = typeof unitsDB.$inferSelect;
