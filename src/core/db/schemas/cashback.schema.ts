import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { customersDB } from "./customer.schema";
import { ordersDB } from "./order.schema";
import { organizationDB } from "./organization.schema";

export const CASHBACK_LEDGER_MOVEMENT_TYPES = ["earned", "redeemed"] as const;

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
    check(
      "customer_cashback_account_balance_non_negative_check",
      sql`${table.balanceCents} >= 0`,
    ),
    check(
      "customer_cashback_account_total_earned_non_negative_check",
      sql`${table.totalEarnedCents} >= 0`,
    ),
    check(
      "customer_cashback_account_total_redeemed_non_negative_check",
      sql`${table.totalRedeemedCents} >= 0`,
    ),
    check(
      "customer_cashback_account_version_non_negative_check",
      sql`${table.version} >= 0`,
    ),
  ],
);

const customerCashbackLedger = pgTable(
  "customer_cashback_ledger",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customersDB.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersDB.id, { onDelete: "restrict" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationDB.id, { onDelete: "restrict" }),
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
    index("customer_cashback_ledger_customer_created_at_idx").on(
      table.customerId,
      table.createdAt,
    ),
    index("customer_cashback_ledger_order_id_idx").on(table.orderId),
    index("customer_cashback_ledger_organization_id_idx").on(table.organizationId),
    check(
      "customer_cashback_ledger_movement_type_check",
      sql`${table.movementType} in ('earned', 'redeemed')`,
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

export const customerCashbackLedgerRelations = relations(
  customerCashbackLedgerDB,
  ({ one }) => ({
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
  }),
);

export type CustomerCashbackAccount = typeof customerCashbackAccountsDB.$inferSelect;
export type CustomerCashbackLedger = typeof customerCashbackLedgerDB.$inferSelect;
export type CashbackLedgerMovementType = (typeof CASHBACK_LEDGER_MOVEMENT_TYPES)[number];
