import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { customersDB } from "./customer.schema";
import { ordersDB } from "./order.schema";
import { organizationDB } from "./organization.schema";
import { userDB } from "./user.schema";

export const CASHBACK_LEDGER_MOVEMENT_TYPES = [
  "earned",
  "redeemed",
  "adjustment_credit",
  "adjustment_debit",
] as const;

const customerCashbackAccounts = pgTable(
  "customer_cashback_account",
  {
    customerId: text("customer_id")
      .primaryKey()
      .references(() => customersDB.id, { onDelete: "cascade" }),
    balanceCents: integer("balance_cents").notNull().default(0),
    totalEarnedCents: integer("total_earned_cents").notNull().default(0),
    totalRedeemedCents: integer("total_redeemed_cents").notNull().default(0),
    version: integer("version").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    check("customer_cashback_account_balance_non_negative_check", sql`${table.balanceCents} >= 0`),
    check(
      "customer_cashback_account_total_earned_non_negative_check",
      sql`${table.totalEarnedCents} >= 0`,
    ),
    check(
      "customer_cashback_account_total_redeemed_non_negative_check",
      sql`${table.totalRedeemedCents} >= 0`,
    ),
    check("customer_cashback_account_version_non_negative_check", sql`${table.version} >= 0`),
  ],
);

const customerCashbackLedger = pgTable(
  "customer_cashback_ledger",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customersDB.id, { onDelete: "cascade" }),
    orderId: text("order_id").references(() => ordersDB.id, { onDelete: "restrict" }),
    organizationId: text("organization_id").references(() => organizationDB.id, {
      onDelete: "restrict",
    }),
    createdByUserId: text("created_by_user_id").references(() => userDB.id, {
      onDelete: "restrict",
    }),
    reason: text("reason"),
    movementType: text("movement_type", { enum: CASHBACK_LEDGER_MOVEMENT_TYPES }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    balanceAfterCents: integer("balance_after_cents").notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("customer_cashback_ledger_order_movement_unique").on(
      table.orderId,
      table.movementType,
    ),
    index("customer_cashback_ledger_customer_created_at_idx").on(table.customerId, table.createdAt),
    index("customer_cashback_ledger_order_id_idx").on(table.orderId),
    index("customer_cashback_ledger_organization_id_idx").on(table.organizationId),
    index("customer_cashback_ledger_created_at_idx").on(table.createdAt, table.id),
    check(
      "customer_cashback_ledger_movement_type_check",
      sql`${table.movementType} in ('earned', 'redeemed', 'adjustment_credit', 'adjustment_debit')`,
    ),
    check(
      "customer_cashback_ledger_source_consistency_check",
      sql`(
        ${table.movementType} in ('earned', 'redeemed')
        and ${table.orderId} is not null
        and ${table.organizationId} is not null
        and ${table.createdByUserId} is null
        and ${table.reason} is null
      ) or (
        ${table.movementType} in ('adjustment_credit', 'adjustment_debit')
        and ${table.orderId} is null
        and ${table.organizationId} is null
        and ${table.createdByUserId} is not null
        and ${table.reason} is not null
        and btrim(${table.reason}) <> ''
      )`,
    ),
    check("customer_cashback_ledger_amount_positive_check", sql`${table.amountCents} > 0`),
    check(
      "customer_cashback_ledger_balance_after_non_negative_check",
      sql`${table.balanceAfterCents} >= 0`,
    ),
  ],
);

export const customerCashbackAccountsDB = customerCashbackAccounts;
export const customerCashbackLedgerDB = customerCashbackLedger;

export const customerCashbackAccountsRelations = relations(
  customerCashbackAccountsDB,
  ({ one, many }) => ({
    customer: one(customersDB, {
      fields: [customerCashbackAccountsDB.customerId],
      references: [customersDB.id],
    }),
    movements: many(customerCashbackLedgerDB),
  }),
);

export const customerCashbackLedgerRelations = relations(customerCashbackLedgerDB, ({ one }) => ({
  customer: one(customersDB, {
    fields: [customerCashbackLedgerDB.customerId],
    references: [customersDB.id],
  }),
  order: one(ordersDB, {
    fields: [customerCashbackLedgerDB.orderId],
    references: [ordersDB.id],
  }),
  organization: one(organizationDB, {
    fields: [customerCashbackLedgerDB.organizationId],
    references: [organizationDB.id],
  }),
  createdBy: one(userDB, {
    fields: [customerCashbackLedgerDB.createdByUserId],
    references: [userDB.id],
  }),
}));

export type CustomerCashbackAccount = typeof customerCashbackAccountsDB.$inferSelect;
export type CustomerCashbackLedger = typeof customerCashbackLedgerDB.$inferSelect;
export type CashbackLedgerMovementType = (typeof CASHBACK_LEDGER_MOVEMENT_TYPES)[number];
