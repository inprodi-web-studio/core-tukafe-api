import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { check, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";

const productCategories = pgTable(
  "product_category",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    parentId: text("parent_id").references((): AnyPgColumn => productCategories.id, {
      onDelete: "set null",
    }),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("product_category_parent_name_unique").on(table.parentId, table.name),
    uniqueIndex("product_category_root_name_unique")
      .on(table.name)
      .where(sql`${table.parentId} IS NULL`),
    index("product_category_parent_id_idx").on(table.parentId),
    check("product_category_color_hex_check", sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
    check(
      "product_category_parent_not_self_check",
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`,
    ),
  ],
);

export const productCategoriesDB = productCategories;
export type ProductCategory = typeof productCategoriesDB.$inferSelect;
