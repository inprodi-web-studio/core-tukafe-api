import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { generateTimestamps, MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { ingredientsDB } from "./ingredient.schema";
import { modifierOptionsDB } from "./modifier.schema";
import { orderPaymentAttemptsDB, ordersDB } from "./order.schema";
import { organizationDB } from "./organization.schema";
import { productsDB } from "./product.schema";
import { suppliesDB } from "./supply.schema";
import { unitsDB } from "./unit.schema";
import { userDB } from "./user.schema";
import { variationsDB } from "./variation.schema";
import { workOrdersDB } from "./workOrder.schema";

export const INVENTORY_ITEM_KINDS = ["ingredient", "supply", "product", "variation"] as const;
export const INVENTORY_LOCATION_TYPES = ["branch", "distribution_center"] as const;
export const INVENTORY_ADJUSTMENT_DIRECTIONS = ["entry", "exit"] as const;
export const INVENTORY_ADJUSTMENT_REASONS = [
  "initial_inventory",
  "correction",
  "internal_recovery",
  "waste",
  "expiration",
  "damage",
  "internal_use",
  "other",
] as const;
export const INVENTORY_MOVEMENT_TYPES = [
  "adjustment_entry",
  "adjustment_exit",
  "adjustment_reversal",
  "checkout_reserve",
  "order_reserve",
  "reservation_release",
  "sale_consumption",
  "purchase_receipt",
  "purchase_receipt_reversal",
] as const;
export const INVENTORY_RESERVATION_KINDS = ["checkout", "order"] as const;
export const INVENTORY_RESERVATION_STATUSES = [
  "active",
  "partially_consumed",
  "consumed",
  "released",
  "expired",
] as const;
export const INVENTORY_OVERRIDE_TARGET_TYPES = ["product", "variation", "modifier_option"] as const;

export const inventoryItemKindEnum = pgEnum("inventory_item_kind", INVENTORY_ITEM_KINDS);
export const inventoryLocationTypeEnum = pgEnum(
  "inventory_location_type",
  INVENTORY_LOCATION_TYPES,
);
export const inventoryAdjustmentDirectionEnum = pgEnum(
  "inventory_adjustment_direction",
  INVENTORY_ADJUSTMENT_DIRECTIONS,
);
export const inventoryAdjustmentReasonEnum = pgEnum(
  "inventory_adjustment_reason",
  INVENTORY_ADJUSTMENT_REASONS,
);
export const inventoryMovementTypeEnum = pgEnum(
  "inventory_movement_type",
  INVENTORY_MOVEMENT_TYPES,
);
export const inventoryReservationKindEnum = pgEnum(
  "inventory_reservation_kind",
  INVENTORY_RESERVATION_KINDS,
);
export const inventoryReservationStatusEnum = pgEnum(
  "inventory_reservation_status",
  INVENTORY_RESERVATION_STATUSES,
);
export const inventoryOverrideTargetTypeEnum = pgEnum(
  "inventory_override_target_type",
  INVENTORY_OVERRIDE_TARGET_TYPES,
);

export const inventoryItemsDB = pgTable(
  "inventory_item",
  {
    id: text("id").primaryKey(),
    kind: inventoryItemKindEnum("kind").notNull(),
    ingredientId: text("ingredient_id").references(() => ingredientsDB.id, {
      onDelete: "restrict",
    }),
    supplyId: text("supply_id").references(() => suppliesDB.id, { onDelete: "restrict" }),
    productId: text("product_id").references(() => productsDB.id, { onDelete: "restrict" }),
    variationId: text("variation_id").references(() => variationsDB.id, {
      onDelete: "restrict",
    }),
    baseUnitId: text("base_unit_id")
      .notNull()
      .references(() => unitsDB.id, { onDelete: "restrict" }),
    isTracked: boolean("is_tracked").notNull().default(true),
    tracksLots: boolean("tracks_lots").notNull().default(false),
    isPerishable: boolean("is_perishable").notNull().default(false),
    expirationWarningDays: integer("expiration_warning_days").notNull().default(3),
    ...generateTimestamps(),
  },
  (table) => [
    check(
      "inventory_item_exactly_one_source_check",
      sql`num_nonnulls(${table.ingredientId}, ${table.supplyId}, ${table.productId}, ${table.variationId}) = 1`,
    ),
    check(
      "inventory_item_kind_source_check",
      sql`(${table.kind} = 'ingredient' and ${table.ingredientId} is not null) or (${table.kind} = 'supply' and ${table.supplyId} is not null) or (${table.kind} = 'product' and ${table.productId} is not null) or (${table.kind} = 'variation' and ${table.variationId} is not null)`,
    ),
    check(
      "inventory_item_expiration_warning_days_non_negative_check",
      sql`${table.expirationWarningDays} >= 0`,
    ),
    uniqueIndex("inventory_item_ingredient_unique")
      .on(table.ingredientId)
      .where(sql`${table.ingredientId} is not null`),
    uniqueIndex("inventory_item_supply_unique")
      .on(table.supplyId)
      .where(sql`${table.supplyId} is not null`),
    uniqueIndex("inventory_item_product_unique")
      .on(table.productId)
      .where(sql`${table.productId} is not null`),
    uniqueIndex("inventory_item_variation_unique")
      .on(table.variationId)
      .where(sql`${table.variationId} is not null`),
    index("inventory_item_base_unit_id_idx").on(table.baseUnitId),
  ],
);

export const inventoryLocationsDB = pgTable(
  "inventory_location",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: inventoryLocationTypeEnum("type").notNull(),
    organizationId: text("organization_id").references(() => organizationDB.id, {
      onDelete: "restrict",
    }),
    timezone: text("timezone").notNull(),
    isDefaultSalesLocation: boolean("is_default_sales_location").notNull().default(false),
    salesEnforcementEnabled: boolean("sales_enforcement_enabled").notNull().default(false),
    activatedAt: timestamp("activated_at", { mode: "date", withTimezone: true }),
    activatedByUserId: text("activated_by_user_id").references(() => userDB.id, {
      onDelete: "restrict",
    }),
    deactivatedAt: timestamp("deactivated_at", { mode: "date", withTimezone: true }),
    deactivatedByUserId: text("deactivated_by_user_id").references(() => userDB.id, {
      onDelete: "restrict",
    }),
    deactivationReason: text("deactivation_reason"),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [
    check(
      "inventory_location_type_organization_check",
      sql`(${table.type} = 'branch' and ${table.organizationId} is not null) or (${table.type} = 'distribution_center' and ${table.organizationId} is null)`,
    ),
    check(
      "inventory_location_default_sales_check",
      sql`${table.type} = 'branch' or ${table.isDefaultSalesLocation} = false`,
    ),
    uniqueIndex("inventory_location_default_branch_unique")
      .on(table.organizationId)
      .where(
        sql`${table.type} = 'branch' and ${table.isDefaultSalesLocation} = true and ${table.deletedAt} is null`,
      ),
    index("inventory_location_organization_id_idx").on(table.organizationId),
    index("inventory_location_type_idx").on(table.type),
  ],
);

export const inventoryLocationAccessDB = pgTable(
  "inventory_location_access",
  {
    locationId: text("location_id")
      .notNull()
      .references(() => inventoryLocationsDB.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => userDB.id, { onDelete: "cascade" }),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "inventory_location_access_pk",
      columns: [table.locationId, table.userId],
    }),
    index("inventory_location_access_user_id_idx").on(table.userId),
  ],
);

export const inventoryLocationItemsDB = pgTable(
  "inventory_location_item",
  {
    locationId: text("location_id")
      .notNull()
      .references(() => inventoryLocationsDB.id, { onDelete: "cascade" }),
    inventoryItemId: text("inventory_item_id")
      .notNull()
      .references(() => inventoryItemsDB.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    lowStockThreshold: numeric("low_stock_threshold", {
      precision: 12,
      scale: 6,
      mode: "number",
    }),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "inventory_location_item_pk",
      columns: [table.locationId, table.inventoryItemId],
    }),
    check(
      "inventory_location_item_low_stock_non_negative_check",
      sql`${table.lowStockThreshold} is null or ${table.lowStockThreshold} >= 0`,
    ),
    index("inventory_location_item_inventory_item_id_idx").on(table.inventoryItemId),
  ],
);

export const inventoryLotsDB = pgTable(
  "inventory_lot",
  {
    id: text("id").primaryKey(),
    inventoryItemId: text("inventory_item_id")
      .notNull()
      .references(() => inventoryItemsDB.id, { onDelete: "restrict" }),
    lotCode: text("lot_code"),
    normalizedLotCode: text("normalized_lot_code"),
    internalBatchKey: text("internal_batch_key").notNull(),
    expiresOn: date("expires_on", { mode: "string" }),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("inventory_lot_item_code_unique")
      .on(table.inventoryItemId, table.normalizedLotCode)
      .where(sql`${table.normalizedLotCode} is not null`),
    uniqueIndex("inventory_lot_item_internal_batch_unique").on(
      table.inventoryItemId,
      table.internalBatchKey,
    ),
    index("inventory_lot_item_expiration_idx").on(table.inventoryItemId, table.expiresOn),
  ],
);

export const inventoryBalancesDB = pgTable(
  "inventory_balance",
  {
    locationId: text("location_id")
      .notNull()
      .references(() => inventoryLocationsDB.id, { onDelete: "restrict" }),
    inventoryItemId: text("inventory_item_id")
      .notNull()
      .references(() => inventoryItemsDB.id, { onDelete: "restrict" }),
    lotId: text("lot_id")
      .notNull()
      .references(() => inventoryLotsDB.id, { onDelete: "restrict" }),
    onHandQuantity: numeric("on_hand_quantity", {
      precision: 12,
      scale: 6,
      mode: "number",
    })
      .notNull()
      .default(0),
    reservedQuantity: numeric("reserved_quantity", {
      precision: 12,
      scale: 6,
      mode: "number",
    })
      .notNull()
      .default(0),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "inventory_balance_pk",
      columns: [table.locationId, table.inventoryItemId, table.lotId],
    }),
    check("inventory_balance_on_hand_non_negative_check", sql`${table.onHandQuantity} >= 0`),
    check("inventory_balance_reserved_non_negative_check", sql`${table.reservedQuantity} >= 0`),
    check(
      "inventory_balance_on_hand_precision_check",
      sql`scale(${table.onHandQuantity}) <= ${sql.raw(String(MAX_SUPPORTED_DECIMAL_PLACES))}`,
    ),
    check(
      "inventory_balance_reserved_precision_check",
      sql`scale(${table.reservedQuantity}) <= ${sql.raw(String(MAX_SUPPORTED_DECIMAL_PLACES))}`,
    ),
    index("inventory_balance_item_location_idx").on(table.inventoryItemId, table.locationId),
  ],
);

export const inventoryAdjustmentsDB = pgTable(
  "inventory_adjustment",
  {
    id: text("id").primaryKey(),
    locationId: text("location_id")
      .notNull()
      .references(() => inventoryLocationsDB.id, { onDelete: "restrict" }),
    direction: inventoryAdjustmentDirectionEnum("direction").notNull(),
    reason: inventoryAdjustmentReasonEnum("reason").notNull(),
    observations: text("observations"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => userDB.id, { onDelete: "restrict" }),
    reversedAt: timestamp("reversed_at", { mode: "date", withTimezone: true }),
    reversedByUserId: text("reversed_by_user_id").references(() => userDB.id, {
      onDelete: "restrict",
    }),
    reversalAdjustmentId: text("reversal_adjustment_id"),
    ...generateTimestamps(),
  },
  (table) => [
    check(
      "inventory_adjustment_other_observations_check",
      sql`${table.reason} <> 'other' or nullif(btrim(${table.observations}), '') is not null`,
    ),
    index("inventory_adjustment_location_created_at_idx").on(table.locationId, table.createdAt),
  ],
);

export const inventoryAdjustmentLinesDB = pgTable(
  "inventory_adjustment_line",
  {
    id: text("id").primaryKey(),
    adjustmentId: text("adjustment_id")
      .notNull()
      .references(() => inventoryAdjustmentsDB.id, { onDelete: "restrict" }),
    inventoryItemId: text("inventory_item_id")
      .notNull()
      .references(() => inventoryItemsDB.id, { onDelete: "restrict" }),
    lotId: text("lot_id")
      .notNull()
      .references(() => inventoryLotsDB.id, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 12, scale: 6, mode: "number" }).notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    check("inventory_adjustment_line_quantity_positive_check", sql`${table.quantity} > 0`),
    check(
      "inventory_adjustment_line_quantity_precision_check",
      sql`scale(${table.quantity}) <= ${sql.raw(String(MAX_SUPPORTED_DECIMAL_PLACES))}`,
    ),
    index("inventory_adjustment_line_adjustment_id_idx").on(table.adjustmentId),
    index("inventory_adjustment_line_item_id_idx").on(table.inventoryItemId),
  ],
);

export const inventoryMovementsDB = pgTable(
  "inventory_movement",
  {
    id: text("id").primaryKey(),
    locationId: text("location_id")
      .notNull()
      .references(() => inventoryLocationsDB.id, { onDelete: "restrict" }),
    type: inventoryMovementTypeEnum("type").notNull(),
    adjustmentId: text("adjustment_id").references(() => inventoryAdjustmentsDB.id, {
      onDelete: "restrict",
    }),
    reservationId: text("reservation_id"),
    orderId: text("order_id").references(() => ordersDB.id, { onDelete: "restrict" }),
    workOrderId: text("work_order_id").references(() => workOrdersDB.id, {
      onDelete: "restrict",
    }),
    purchaseReceiptId: text("purchase_receipt_id"),
    actorUserId: text("actor_user_id").references(() => userDB.id, {
      onDelete: "restrict",
    }),
    ...generateTimestamps(),
  },
  (table) => [
    index("inventory_movement_location_created_at_idx").on(table.locationId, table.createdAt),
    index("inventory_movement_adjustment_id_idx").on(table.adjustmentId),
    index("inventory_movement_order_id_idx").on(table.orderId),
    index("inventory_movement_purchase_receipt_id_idx").on(table.purchaseReceiptId),
  ],
);

export const inventoryMovementLinesDB = pgTable(
  "inventory_movement_line",
  {
    id: text("id").primaryKey(),
    movementId: text("movement_id")
      .notNull()
      .references(() => inventoryMovementsDB.id, { onDelete: "restrict" }),
    inventoryItemId: text("inventory_item_id")
      .notNull()
      .references(() => inventoryItemsDB.id, { onDelete: "restrict" }),
    lotId: text("lot_id")
      .notNull()
      .references(() => inventoryLotsDB.id, { onDelete: "restrict" }),
    onHandDelta: numeric("on_hand_delta", {
      precision: 12,
      scale: 6,
      mode: "number",
    })
      .notNull()
      .default(0),
    reservedDelta: numeric("reserved_delta", {
      precision: 12,
      scale: 6,
      mode: "number",
    })
      .notNull()
      .default(0),
    onHandAfter: numeric("on_hand_after", {
      precision: 12,
      scale: 6,
      mode: "number",
    }).notNull(),
    reservedAfter: numeric("reserved_after", {
      precision: 12,
      scale: 6,
      mode: "number",
    }).notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    check(
      "inventory_movement_line_non_zero_check",
      sql`${table.onHandDelta} <> 0 or ${table.reservedDelta} <> 0`,
    ),
    index("inventory_movement_line_movement_id_idx").on(table.movementId),
    index("inventory_movement_line_item_id_idx").on(table.inventoryItemId),
  ],
);

export const inventoryReservationsDB = pgTable(
  "inventory_reservation",
  {
    id: text("id").primaryKey(),
    locationId: text("location_id")
      .notNull()
      .references(() => inventoryLocationsDB.id, { onDelete: "restrict" }),
    kind: inventoryReservationKindEnum("kind").notNull(),
    status: inventoryReservationStatusEnum("status").notNull().default("active"),
    paymentAttemptId: text("payment_attempt_id").references(() => orderPaymentAttemptsDB.id, {
      onDelete: "restrict",
    }),
    orderId: text("order_id").references(() => ordersDB.id, { onDelete: "restrict" }),
    requirementsSnapshot: jsonb("requirements_snapshot")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }),
    releasedAt: timestamp("released_at", { mode: "date", withTimezone: true }),
    ...generateTimestamps(),
  },
  (table) => [
    check(
      "inventory_reservation_source_check",
      sql`(${table.kind} = 'checkout' and ${table.paymentAttemptId} is not null and ${table.expiresAt} is not null) or (${table.kind} = 'order' and ${table.orderId} is not null)`,
    ),
    index("inventory_reservation_status_expires_at_idx").on(table.status, table.expiresAt),
    index("inventory_reservation_order_id_idx").on(table.orderId),
    index("inventory_reservation_payment_attempt_id_idx").on(table.paymentAttemptId),
  ],
);

export const inventoryReservationAllocationsDB = pgTable(
  "inventory_reservation_allocation",
  {
    id: text("id").primaryKey(),
    reservationId: text("reservation_id")
      .notNull()
      .references(() => inventoryReservationsDB.id, { onDelete: "restrict" }),
    inventoryItemId: text("inventory_item_id")
      .notNull()
      .references(() => inventoryItemsDB.id, { onDelete: "restrict" }),
    lotId: text("lot_id")
      .notNull()
      .references(() => inventoryLotsDB.id, { onDelete: "restrict" }),
    workOrderId: text("work_order_id").references(() => workOrdersDB.id, {
      onDelete: "restrict",
    }),
    reservedQuantity: numeric("reserved_quantity", {
      precision: 12,
      scale: 6,
      mode: "number",
    }).notNull(),
    consumedQuantity: numeric("consumed_quantity", {
      precision: 12,
      scale: 6,
      mode: "number",
    })
      .notNull()
      .default(0),
    releasedQuantity: numeric("released_quantity", {
      precision: 12,
      scale: 6,
      mode: "number",
    })
      .notNull()
      .default(0),
    ...generateTimestamps(),
  },
  (table) => [
    check(
      "inventory_reservation_allocation_quantities_check",
      sql`${table.reservedQuantity} > 0 and ${table.consumedQuantity} >= 0 and ${table.releasedQuantity} >= 0 and ${table.consumedQuantity} + ${table.releasedQuantity} <= ${table.reservedQuantity}`,
    ),
    index("inventory_reservation_allocation_reservation_id_idx").on(table.reservationId),
    index("inventory_reservation_allocation_work_order_id_idx").on(table.workOrderId),
  ],
);

export const inventoryAvailabilityOverridesDB = pgTable(
  "inventory_availability_override",
  {
    id: text("id").primaryKey(),
    locationId: text("location_id")
      .notNull()
      .references(() => inventoryLocationsDB.id, { onDelete: "restrict" }),
    targetType: inventoryOverrideTargetTypeEnum("target_type").notNull(),
    productId: text("product_id").references(() => productsDB.id, { onDelete: "restrict" }),
    variationId: text("variation_id").references(() => variationsDB.id, {
      onDelete: "restrict",
    }),
    modifierOptionId: text("modifier_option_id").references(() => modifierOptionsDB.id, {
      onDelete: "restrict",
    }),
    reason: text("reason").notNull(),
    startsAt: timestamp("starts_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { mode: "date", withTimezone: true }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => userDB.id, { onDelete: "restrict" }),
    clearedAt: timestamp("cleared_at", { mode: "date", withTimezone: true }),
    clearedByUserId: text("cleared_by_user_id").references(() => userDB.id, {
      onDelete: "restrict",
    }),
    ...generateTimestamps(),
  },
  (table) => [
    check(
      "inventory_availability_override_exactly_one_target_check",
      sql`num_nonnulls(${table.productId}, ${table.variationId}, ${table.modifierOptionId}) = 1`,
    ),
    check(
      "inventory_availability_override_target_type_check",
      sql`(${table.targetType} = 'product' and ${table.productId} is not null) or (${table.targetType} = 'variation' and ${table.variationId} is not null) or (${table.targetType} = 'modifier_option' and ${table.modifierOptionId} is not null)`,
    ),
    check(
      "inventory_availability_override_interval_check",
      sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`,
    ),
    index("inventory_availability_override_location_active_idx").on(
      table.locationId,
      table.clearedAt,
      table.endsAt,
    ),
  ],
);

export type InventoryItem = typeof inventoryItemsDB.$inferSelect;
export type InventoryLocation = typeof inventoryLocationsDB.$inferSelect;
export type InventoryLot = typeof inventoryLotsDB.$inferSelect;
export type InventoryAdjustment = typeof inventoryAdjustmentsDB.$inferSelect;
export type InventoryReservation = typeof inventoryReservationsDB.$inferSelect;
export type InventoryItemKind = (typeof inventoryItemKindEnum.enumValues)[number];
export type InventoryLocationType = (typeof inventoryLocationTypeEnum.enumValues)[number];
export type InventoryAdjustmentDirection =
  (typeof inventoryAdjustmentDirectionEnum.enumValues)[number];
export type InventoryAdjustmentReason = (typeof inventoryAdjustmentReasonEnum.enumValues)[number];
export type InventoryOverrideTargetType =
  (typeof inventoryOverrideTargetTypeEnum.enumValues)[number];
