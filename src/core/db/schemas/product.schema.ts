import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { productCategoriesDB } from "./productCategory.schema";
import { unitsDB } from "./unit.schema";

export const PRODUCT_TYPES = ["simple", "assembled", "compound"] as const;

export const productTypeEnum = pgEnum("product_type", PRODUCT_TYPES);

const products = pgTable(
  "product",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kitchenName: text("kitchen_name"),
    priceCents: integer("price_cents"),
    customerDescription: text("customer_description"),
    kitchenDescription: text("kitchen_description"),
    unitId: text("unit_id")
      .notNull()
      .references(() => unitsDB.id, { onDelete: "restrict" }),
    categoryId: text("category_id").references(() => productCategoriesDB.id, {
      onDelete: "restrict",
    }),
    productType: productTypeEnum("product_type").notNull().default("simple"),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [
    check("product_price_cents_non_negative_check", sql`${table.priceCents} >= 0`),
    uniqueIndex("product_name_active_unique")
      .on(table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    index("product_name_idx").on(table.name),
    index("product_unit_id_idx").on(table.unitId),
    index("product_category_id_idx").on(table.categoryId),
    index("product_product_type_idx").on(table.productType),
  ],
);
export const productsDB = products;
export const productsRelations = relations(productsDB, ({ one }) => ({
  unit: one(unitsDB, {
    fields: [productsDB.unitId],
    references: [unitsDB.id],
  }),
  category: one(productCategoriesDB, {
    fields: [productsDB.categoryId],
    references: [productCategoriesDB.id],
  }),
}));

export type Product = typeof productsDB.$inferSelect;
export type ProductType = (typeof productTypeEnum.enumValues)[number];
