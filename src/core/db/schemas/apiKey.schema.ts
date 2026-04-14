import { generateTimestamps } from "@core/utils";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { userDB } from "./user.schema";

const apiKey = pgTable(
  "apikey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    start: text("start"),
    prefix: text("prefix"),
    key: text("key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => userDB.id, { onDelete: "cascade" }),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at", { mode: "date" }),
    enabled: boolean("enabled").notNull().default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").notNull().default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window"),
    rateLimitMax: integer("rate_limit_max"),
    requestCount: integer("request_count").notNull().default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request", { mode: "date" }),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    permissions: text("permissions"),
    metadata: text("metadata"),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("apikey_key_unique").on(table.key),
    index("apikey_user_id_idx").on(table.userId),
    index("apikey_expires_at_idx").on(table.expiresAt),
  ],
);

export const apiKeyDB = apiKey;

export type ApiKey = typeof apiKeyDB.$inferSelect;
