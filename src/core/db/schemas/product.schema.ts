import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { productCategoriesDB } from "./productCategory.schema";
import { taxDB } from "./tax.schema";
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

const productTax = pgTable(
  "product_tax",
  {
    productId: text("product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "cascade" }),
    taxId: text("tax_id")
      .notNull()
      .references(() => taxDB.id, { onDelete: "cascade" }),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "product_tax_pk",
      columns: [table.productId, table.taxId],
    }),
    index("product_tax_product_id_idx").on(table.productId),
    index("product_tax_tax_id_idx").on(table.taxId),
  ],
);

export const productsDB = products;
export const productTaxDB = productTax;
export const productsRelations = relations(productsDB, ({ one, many }) => ({
  unit: one(unitsDB, {
    fields: [productsDB.unitId],
    references: [unitsDB.id],
  }),
  category: one(productCategoriesDB, {
    fields: [productsDB.categoryId],
    references: [productCategoriesDB.id],
  }),
  taxes: many(productTaxDB),
}));
export const productTaxRelations = relations(productTaxDB, ({ one }) => ({
  product: one(productsDB, {
    fields: [productTaxDB.productId],
    references: [productsDB.id],
  }),
  tax: one(taxDB, {
    fields: [productTaxDB.taxId],
    references: [taxDB.id],
  }),
}));

export type Product = typeof productsDB.$inferSelect;
export type ProductTax = typeof productTaxDB.$inferSelect;
export type ProductType = (typeof productTypeEnum.enumValues)[number];
