import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizationDB } from "./organization.schema";

const organizationSchedule = pgTable(
  "organization_schedules",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationDB.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    opensAt: time("opens_at").notNull(),
    closesAt: time("closes_at").notNull(),
  },
  (table) => [
    primaryKey({
      name: "organization_schedules_pk",
      columns: [table.organizationId, table.dayOfWeek],
    }),
    check(
      "organization_schedules_day_of_week_check",
      sql`${table.dayOfWeek} >= 0 AND ${table.dayOfWeek} <= 6`,
    ),
    check("organization_schedules_open_close_check", sql`${table.opensAt} < ${table.closesAt}`),
    index("organization_schedules_day_of_week_idx").on(table.dayOfWeek),
  ],
);

export const organizationScheduleDB = organizationSchedule;
export type OrganizationSchedule = typeof organizationScheduleDB.$inferSelect;
