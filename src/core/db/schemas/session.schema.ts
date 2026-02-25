import { userDB } from "./user.schema";
import { generateTimestamps } from "@core/utils";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
    userAgent: text("user_agent"),
    impersonatedBy: text("impersonated_by"),
    ...generateTimestamps(),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const sessionDB = session;
export type Session = typeof sessionDB.$inferSelect;
