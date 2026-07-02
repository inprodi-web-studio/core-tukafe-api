import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { generateTimestamps, MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { orderItemsDB, ordersDB } from "./order.schema";
import { organizationDB } from "./organization.schema";
import { userDB } from "./user.schema";

export const WORK_ORDER_STATUSES = ["open", "completed"] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export interface WorkOrderModifierSnapshot {
  modifierId: string;
  modifierName: string;
  modifierKitchenName: string | null;
  modifierOptionId: string;
  modifierOptionName: string;
  modifierOptionKitchenName: string | null;
  quantity: number;
}

export interface WorkOrderVariationSelectionSnapshot {
  groupId: string;
  groupName: string;
  groupCustomerLabel: string | null;
  optionId: string;
  optionName: string;
  optionKitchenName?: string | null;
}

const workOrders = pgTable(
  "work_order",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationDB.id, { onDelete: "restrict" }),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersDB.id, { onDelete: "cascade" }),
    orderItemId: text("order_item_id")
      .notNull()
      .references(() => orderItemsDB.id, { onDelete: "cascade" }),
    orderFolio: text("order_folio").notNull(),
    customerDisplayName: text("customer_display_name"),
    productName: text("product_name").notNull(),
    productKitchenName: text("product_kitchen_name"),
    variationName: text("variation_name"),
    variationSelectionsSnapshot: jsonb("variation_selections_snapshot")
      .$type<WorkOrderVariationSelectionSnapshot[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    modifiersSnapshot: jsonb("modifiers_snapshot")
      .$type<WorkOrderModifierSnapshot[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    orderComment: text("order_comment"),
    itemComment: text("item_comment"),
    unitIndex: integer("unit_index").notNull().default(1),
    quantitySnapshot: numeric("quantity_snapshot", {
      precision: 12,
      scale: 6,
      mode: "number",
    }).notNull(),
    status: text("status", { enum: WORK_ORDER_STATUSES }).notNull().default("open"),
    completedAt: timestamp("completed_at", { mode: "date" }),
    completedByUserId: text("completed_by_user_id").references(() => userDB.id, {
      onDelete: "restrict",
    }),
    ...generateTimestamps(),
  },
  (table) => [
    index("work_order_organization_status_created_at_idx").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    index("work_order_order_id_idx").on(table.orderId),
    index("work_order_order_item_id_idx").on(table.orderItemId),
    index("work_order_completed_by_user_id_idx").on(table.completedByUserId),
    check("work_order_status_check", sql`${table.status} in ('open', 'completed')`),
    check("work_order_unit_index_positive_check", sql`${table.unitIndex} > 0`),
    check("work_order_quantity_snapshot_positive_check", sql`${table.quantitySnapshot} > 0`),
    check(
      "work_order_quantity_snapshot_precision_check",
      sql`scale(${table.quantitySnapshot}) <= ${sql.raw(String(MAX_SUPPORTED_DECIMAL_PLACES))}`,
    ),
    check(
      "work_order_completion_consistency_check",
      sql`(${table.status} = 'open' and ${table.completedAt} is null and ${table.completedByUserId} is null) or (${table.status} = 'completed' and ${table.completedAt} is not null and ${table.completedByUserId} is not null)`,
    ),
  ],
);

export const workOrdersDB = workOrders;

export const workOrdersRelations = relations(workOrdersDB, ({ one }) => ({
  organization: one(organizationDB, {
    fields: [workOrdersDB.organizationId],
    references: [organizationDB.id],
  }),
  order: one(ordersDB, {
    fields: [workOrdersDB.orderId],
    references: [ordersDB.id],
  }),
  orderItem: one(orderItemsDB, {
    fields: [workOrdersDB.orderItemId],
    references: [orderItemsDB.id],
  }),
  completedByUser: one(userDB, {
    fields: [workOrdersDB.completedByUserId],
    references: [userDB.id],
  }),
}));

export type WorkOrder = typeof workOrdersDB.$inferSelect;
