import { sql } from "drizzle-orm";
import { check, doublePrecision, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

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
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    timezone: text("timezone").notNull().default("America/Mexico_City"),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [
    uniqueIndex("organization_slug_unique").on(table.slug),
    check(
      "organization_latitude_range_check",
      sql`${table.latitude} is null or (${table.latitude} >= -90 and ${table.latitude} <= 90)`,
    ),
    check(
      "organization_longitude_range_check",
      sql`${table.longitude} is null or (${table.longitude} >= -180 and ${table.longitude} <= 180)`,
    ),
    check(
      "organization_coordinates_pair_check",
      sql`(${table.latitude} is null and ${table.longitude} is null) or (${table.latitude} is not null and ${table.longitude} is not null)`,
    ),
  ],
);

export const organizationDB = organization;

export type Organization = typeof organizationDB.$inferSelect;
