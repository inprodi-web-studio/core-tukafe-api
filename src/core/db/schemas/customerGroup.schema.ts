import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

const customerGroups = pgTable(
  "customer_group",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon"),
    color: text("color"),
  },
  (table) => [uniqueIndex("customer_group_name_unique").on(table.name)],
);

export const customerGroupsDB = customerGroups;
export type CustomerGroup = typeof customerGroupsDB.$inferSelect;
