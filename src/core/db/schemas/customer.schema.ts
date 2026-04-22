import { relations, sql } from "drizzle-orm";
import { date, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { customerGroupsDB } from "./customerGroup.schema";
import { userDB } from "./user.schema";

const customers = pgTable(
  "customer",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => userDB.id, { onDelete: "set null" }),
    phone: text("phone"),
    name: text("name"),
    middleName: text("middle_name"),
    lastName: text("last_name"),
    email: text("email"),
    groupId: text("group_id").references(() => customerGroupsDB.id, {
      onDelete: "set null",
    }),
    gender: text("gender"),
    birthdate: date("birthdate", { mode: "date" }),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [
    uniqueIndex("customer_user_id_active_unique")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL AND ${table.userId} IS NOT NULL`),
    uniqueIndex("customer_phone_active_unique")
      .on(table.phone)
      .where(sql`${table.deletedAt} IS NULL AND ${table.phone} IS NOT NULL`),
    index("customer_group_id_idx").on(table.groupId),
    index("customer_phone_idx").on(table.phone),
    index("customer_user_id_idx").on(table.userId),
  ],
);

export const customersDB = customers;

export const customersRelations = relations(customersDB, ({ one }) => ({
  user: one(userDB, {
    fields: [customersDB.userId],
    references: [userDB.id],
  }),
  group: one(customerGroupsDB, {
    fields: [customersDB.groupId],
    references: [customerGroupsDB.id],
  }),
}));

export type Customer = typeof customersDB.$inferSelect;
