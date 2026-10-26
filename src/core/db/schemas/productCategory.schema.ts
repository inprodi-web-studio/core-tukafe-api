import { relations, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { uploadsDB } from "./upload.schema";
import { organizationDB } from "./organization.schema";

const productCategories = pgTable(
  "product_category",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isFourPlusOneEligible: boolean("is_four_plus_one_eligible").notNull().default(false),
    isCashbackEligible: boolean("is_cashback_eligible").notNull().default(false),
    imageUploadId: text("image_upload_id").references(() => uploadsDB.id, {
      onDelete: "restrict",
    }),
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
    index("product_category_parent_sort_order_idx").on(table.parentId, table.sortOrder),
    index("product_category_image_upload_id_idx").on(table.imageUploadId),
    check("product_category_color_hex_check", sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
    check("product_category_sort_order_non_negative_check", sql`${table.sortOrder} >= 0`),
    check(
      "product_category_parent_not_self_check",
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`,
    ),
  ],
);

export const productCategoriesDB = productCategories;
export const organizationProductCategoriesDB = pgTable(
  "organization_product_category",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationDB.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => productCategoriesDB.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").notNull().default(true),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.categoryId] }),
    index("organization_product_category_category_idx").on(table.categoryId),
  ],
);
export const productCategoriesRelations = relations(productCategoriesDB, ({ one }) => ({
  image: one(uploadsDB, {
    fields: [productCategoriesDB.imageUploadId],
    references: [uploadsDB.id],
  }),
}));
export type ProductCategory = typeof productCategoriesDB.$inferSelect;
