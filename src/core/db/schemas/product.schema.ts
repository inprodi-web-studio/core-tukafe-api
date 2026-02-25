import {
  boolean,
  index,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { productCategoriesDB } from "./productCategory.schema";
import { organizationDB } from "./organization.schema";

const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    categoryId: text("category_id").references(() => productCategoriesDB.id, {
      onDelete: "set null",
    }),
    isLoyaltyProgram: boolean("is_loyalty_program").notNull().default(false),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [
    uniqueIndex("products_name_unique").on(table.name),
    index("products_category_id_idx").on(table.categoryId),
  ],
);

const organizationProducts = pgTable(
  "organization_products",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationDB.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").notNull().default(true),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "organization_products_pk",
      columns: [table.organizationId, table.productId],
    }),
    index("organization_products_organization_id_idx").on(table.organizationId),
    index("organization_products_product_id_idx").on(table.productId),
  ],
);

export const productsDB = products;
export const organizationProductsDB = organizationProducts;

export type Product = typeof productsDB.$inferSelect;
export type OrganizationProduct = typeof organizationProductsDB.$inferSelect;
