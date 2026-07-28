import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { customersDB } from "./customer.schema";
import { organizationDB } from "./organization.schema";
import { ordersDB } from "./order.schema";
import { userDB } from "./user.schema";

export const PUSH_PLATFORMS = ["ios", "android"] as const;
export const NOTIFICATION_DESTINATIONS = ["home", "orders"] as const;
export const NOTIFICATION_CAMPAIGN_SCOPES = ["brand", "organization"] as const;
export const NOTIFICATION_CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "processing",
  "sent",
  "partial",
  "failed",
  "cancelled",
] as const;
export const NOTIFICATION_OUTBOX_STATUSES = [
  "pending",
  "processing",
  "sent",
  "skipped",
  "failed",
] as const;

export const customerNotificationPreferencesDB = pgTable(
  "customer_notification_preferences",
  {
    customerId: text("customer_id")
      .primaryKey()
      .references(() => customersDB.id, { onDelete: "cascade" }),
    orderReadyEnabled: boolean("order_ready_enabled").notNull().default(true),
    promotionsEnabled: boolean("promotions_enabled").notNull().default(false),
    ...generateTimestamps(),
  },
  (table) => [index("customer_notification_preferences_updated_at_idx").on(table.updatedAt)],
);

export const customerPushInstallationsDB = pgTable(
  "customer_push_installation",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customersDB.id, { onDelete: "cascade" }),
    installationId: text("installation_id").notNull(),
    registrationTarget: text("registration_target").notNull(),
    platform: text("platform", { enum: PUSH_PLATFORMS }).notNull(),
    appVersion: text("app_version"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true, mode: "date" }),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("customer_push_installation_installation_id_unique").on(table.installationId),
    uniqueIndex("customer_push_installation_registration_target_unique").on(
      table.registrationTarget,
    ),
    index("customer_push_installation_customer_id_idx").on(table.customerId),
    index("customer_push_installation_active_last_seen_idx").on(
      table.disabledAt,
      table.lastSeenAt,
    ),
    check(
      "customer_push_installation_platform_check",
      sql`${table.platform} in ('ios', 'android')`,
    ),
    check(
      "customer_push_installation_target_non_empty_check",
      sql`btrim(${table.registrationTarget}) <> ''`,
    ),
  ],
);

export const notificationCampaignsDB = pgTable(
  "notification_campaign",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organizationDB.id, {
      onDelete: "restrict",
    }),
    scope: text("scope", { enum: NOTIFICATION_CAMPAIGN_SCOPES }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    destination: text("destination", { enum: NOTIFICATION_DESTINATIONS }).notNull(),
    status: text("status", { enum: NOTIFICATION_CAMPAIGN_STATUSES })
      .notNull()
      .default("draft"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: "date" }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => userDB.id, { onDelete: "restrict" }),
    recipientCount: integer("recipient_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    invalidInstallationCount: integer("invalid_installation_count").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    index("notification_campaign_status_scheduled_at_idx").on(table.status, table.scheduledAt),
    index("notification_campaign_organization_created_at_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    check(
      "notification_campaign_scope_check",
      sql`${table.scope} in ('brand', 'organization')`,
    ),
    check(
      "notification_campaign_scope_organization_check",
      sql`(${table.scope} = 'brand' and ${table.organizationId} is null) or (${table.scope} = 'organization' and ${table.organizationId} is not null)`,
    ),
    check(
      "notification_campaign_status_check",
      sql`${table.status} in ('draft', 'scheduled', 'processing', 'sent', 'partial', 'failed', 'cancelled')`,
    ),
    check(
      "notification_campaign_destination_check",
      sql`${table.destination} in ('home', 'orders')`,
    ),
    check("notification_campaign_title_non_empty_check", sql`btrim(${table.title}) <> ''`),
    check("notification_campaign_body_non_empty_check", sql`btrim(${table.body}) <> ''`),
  ],
);

export const notificationOutboxDB = pgTable(
  "notification_outbox",
  {
    id: text("id").primaryKey(),
    dedupeKey: text("dedupe_key").notNull(),
    eventType: text("event_type").notNull(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customersDB.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").references(() => notificationCampaignsDB.id, {
      onDelete: "cascade",
    }),
    orderId: text("order_id").references(() => ordersDB.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    destination: text("destination", { enum: NOTIFICATION_DESTINATIONS }).notNull(),
    status: text("status", { enum: NOTIFICATION_OUTBOX_STATUSES })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true, mode: "date" }),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
    lastError: text("last_error"),
    invalidInstallationCount: integer("invalid_installation_count").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("notification_outbox_dedupe_key_unique").on(table.dedupeKey),
    index("notification_outbox_claim_idx").on(table.status, table.availableAt),
    index("notification_outbox_campaign_id_idx").on(table.campaignId),
    index("notification_outbox_customer_id_idx").on(table.customerId),
    check(
      "notification_outbox_status_check",
      sql`${table.status} in ('pending', 'processing', 'sent', 'skipped', 'failed')`,
    ),
    check(
      "notification_outbox_destination_check",
      sql`${table.destination} in ('home', 'orders')`,
    ),
    check(
      "notification_outbox_attempts_check",
      sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0`,
    ),
  ],
);

export const customerNotificationPreferencesRelations = relations(
  customerNotificationPreferencesDB,
  ({ one }) => ({
    customer: one(customersDB, {
      fields: [customerNotificationPreferencesDB.customerId],
      references: [customersDB.id],
    }),
  }),
);

export const customerPushInstallationsRelations = relations(
  customerPushInstallationsDB,
  ({ one }) => ({
    customer: one(customersDB, {
      fields: [customerPushInstallationsDB.customerId],
      references: [customersDB.id],
    }),
  }),
);

export const notificationCampaignsRelations = relations(notificationCampaignsDB, ({ one }) => ({
  organization: one(organizationDB, {
    fields: [notificationCampaignsDB.organizationId],
    references: [organizationDB.id],
  }),
  createdBy: one(userDB, {
    fields: [notificationCampaignsDB.createdByUserId],
    references: [userDB.id],
  }),
}));

export const notificationOutboxRelations = relations(notificationOutboxDB, ({ one }) => ({
  customer: one(customersDB, {
    fields: [notificationOutboxDB.customerId],
    references: [customersDB.id],
  }),
  campaign: one(notificationCampaignsDB, {
    fields: [notificationOutboxDB.campaignId],
    references: [notificationCampaignsDB.id],
  }),
  order: one(ordersDB, {
    fields: [notificationOutboxDB.orderId],
    references: [ordersDB.id],
  }),
}));

export type NotificationCampaign = typeof notificationCampaignsDB.$inferSelect;
export type NotificationOutbox = typeof notificationOutboxDB.$inferSelect;
