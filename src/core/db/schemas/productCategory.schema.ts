import { boolean, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";

const productCategories = pgTable(
  "product_categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    parentId: text("parent_id"),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("product_categories_name_unique").on(table.name),
    index("product_categories_parent_id_idx").on(table.parentId),
  ],
);

export const productCategoriesDB = productCategories;
export type ProductCategory = typeof productCategoriesDB.$inferSelect;
