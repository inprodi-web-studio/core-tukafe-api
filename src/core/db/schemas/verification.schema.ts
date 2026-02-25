import { generateTimestamps } from "@core/utils";
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("verification_identifier_value_unique").on(table.identifier, table.value),
  ],
);

export const verificationDB = verification;
export type Verification = typeof verificationDB.$inferSelect;
