import { sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";

const suppliers = pgTable(
  "supplier",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [
    uniqueIndex("supplier_name_active_unique")
      .on(table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("supplier_email_active_unique")
      .on(table.email)
      .where(sql`${table.deletedAt} IS NULL AND ${table.email} IS NOT NULL`),
    uniqueIndex("supplier_phone_active_unique")
      .on(table.phone)
      .where(sql`${table.deletedAt} IS NULL AND ${table.phone} IS NOT NULL`),
    index("supplier_name_idx").on(table.name),
    index("supplier_email_idx").on(table.email),
    index("supplier_phone_idx").on(table.phone),
  ],
);

export const suppliersDB = suppliers;

export type Supplier = typeof suppliersDB.$inferSelect;
