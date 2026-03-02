import { generateTimestamps } from "@core/utils";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizationDB } from "./organization.schema";
import { userDB } from "./user.schema";

const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationDB.id, { onDelete: "cascade" }),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => userDB.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    ...generateTimestamps(),
  },
  (table) => [
    index("invitation_organization_id_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

export const invitationDB = invitation;
export type Invitation = typeof invitationDB.$inferSelect;
