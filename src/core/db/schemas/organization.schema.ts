import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";

const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logo: text("logo"),
    metadata: text("metadata"),
    address: text("address").notNull(),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [uniqueIndex("organization_slug_unique").on(table.slug)],
);

export const organizationDB = organization;

export type Organization = typeof organizationDB.$inferSelect;
