import { generateTimestamps } from "@core/utils";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { customersDB } from "./customer.schema";

const customerQrLoginTokens = pgTable(
  "customer_qr_login_token",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customersDB.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { mode: "date" }),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("customer_qr_login_token_hash_unique").on(table.tokenHash),
    index("customer_qr_login_token_customer_id_idx").on(table.customerId),
    index("customer_qr_login_token_expires_at_idx").on(table.expiresAt),
  ],
);

export const customerQrLoginTokensDB = customerQrLoginTokens;
export type CustomerQrLoginToken = typeof customerQrLoginTokensDB.$inferSelect;
