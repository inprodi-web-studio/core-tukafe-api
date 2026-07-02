import { relations } from "drizzle-orm";
import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { customersDB } from "./customer.schema";
import { productsDB } from "./product.schema";

const customerProductFavorite = pgTable(
  "customer_product_favorite",
  {
    customerId: text("customer_id")
      .notNull()
      .references(() => customersDB.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "cascade" }),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "customer_product_favorite_pk",
      columns: [table.customerId, table.productId],
    }),
    index("customer_product_favorite_customer_id_idx").on(table.customerId),
    index("customer_product_favorite_product_id_idx").on(table.productId),
  ],
);

export const customerProductFavoritesDB = customerProductFavorite;

export const customerProductFavoritesRelations = relations(
  customerProductFavoritesDB,
  ({ one }) => ({
    customer: one(customersDB, {
      fields: [customerProductFavoritesDB.customerId],
      references: [customersDB.id],
    }),
    product: one(productsDB, {
      fields: [customerProductFavoritesDB.productId],
      references: [productsDB.id],
    }),
  }),
);

export type CustomerProductFavorite = typeof customerProductFavoritesDB.$inferSelect;
