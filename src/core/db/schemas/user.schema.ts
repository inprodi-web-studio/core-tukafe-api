import { generateTimestamps } from "@core/utils";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  middleName: text("middle_name"),
  lastName: text("last_name"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  phoneNumber: text("phone_number").unique(),
  phoneNumberVerified: boolean("phone_number_verified").notNull().default(false),
  role: text("role").notNull().default("customer"),
  banned: boolean("banned").notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { mode: "date" }),
  ...generateTimestamps({ withDeletedAt: false }),
});

export const userDB = user;
export type User = typeof userDB.$inferSelect;
