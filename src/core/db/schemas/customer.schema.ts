import { bigint, date, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { userDB } from "./user.schema";
import { customerGroupsDB } from "./customerGroups.schema";

const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    groupId: text("group_id").references(() => customerGroupsDB.id, {
      onDelete: "set null",
    }),
    gender: text("gender"),
    birthdate: date("birthdate", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("customers_email_unique").on(table.email),
    index("customers_group_id_idx").on(table.groupId),
  ],
);

const customerUsers = pgTable(
  "customer_users",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => userDB.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("customer_users_customer_id_unique").on(table.customerId)],
);

export const customersDB = customers;
export const customerUsersDB = customerUsers;

export type Customer = typeof customersDB.$inferSelect;
export type CustomerUser = typeof customerUsersDB.$inferSelect;
