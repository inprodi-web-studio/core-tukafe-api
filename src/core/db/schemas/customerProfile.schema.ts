import { date, index, pgTable, text } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { customerGroupsDB } from "./customerGroup.schema";
import { userDB } from "./user.schema";

const customerProfile = pgTable(
  "customer_profile",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => userDB.id, { onDelete: "cascade" }),
    groupId: text("group_id").references(() => customerGroupsDB.id, {
      onDelete: "set null",
    }),
    gender: text("gender"),
    birthdate: date("birthdate", { mode: "date" }),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [index("customer_profile_group_id_idx").on(table.groupId)],
);

export const customerProfileDB = customerProfile;

export type CustomerProfile = typeof customerProfileDB.$inferSelect;
