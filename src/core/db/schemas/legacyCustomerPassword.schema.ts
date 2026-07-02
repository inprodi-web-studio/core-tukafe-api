import { generateTimestamps } from "@core/utils";
import { pgTable, text } from "drizzle-orm/pg-core";

import { userDB } from "./user.schema";

const legacyCustomerPasswords = pgTable("legacy_customer_password", {
  userId: text("user_id")
    .primaryKey()
    .references(() => userDB.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  algorithm: text("algorithm").notNull(),
  parameters: text("parameters"),
  ...generateTimestamps(),
});

export const legacyCustomerPasswordsDB = legacyCustomerPasswords;
export type LegacyCustomerPassword = typeof legacyCustomerPasswordsDB.$inferSelect;
