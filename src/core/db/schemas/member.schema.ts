import { generateTimestamps } from "@core/utils";
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { organizationDB } from "./organization.schema";
import { userDB } from "./user.schema";

const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userDB.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationDB.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("member_organization_user_unique").on(table.organizationId, table.userId),
    index("member_organization_id_idx").on(table.organizationId),
    index("member_user_id_idx").on(table.userId),
  ],
);

export const memberDB = member;
export type Member = typeof memberDB.$inferSelect;
