import { generateTimestamps } from "@core/utils";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { userDB } from "./user.schema";

const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => userDB.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    ipAddress: text("ip_address"),
    city: text("city"),
    country: text("country"),
    userAgent: text("user_agent"),
    impersonatedBy: text("impersonated_by"),
    activeOrganizationId: text("active_organization_id"),
    ...generateTimestamps(),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const sessionDB = session;
export type Session = typeof sessionDB.$inferSelect;
