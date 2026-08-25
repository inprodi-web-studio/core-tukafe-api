import { sql } from "drizzle-orm";
import {
  check,
  boolean,
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
import {
  inventoryItemsDB,
  inventoryLocationsDB,
  inventoryLotsDB,
  inventoryMovementsDB,
} from "./inventory.schema";
import { supplierItemPresentationsDB, supplierItemsDB, suppliersDB } from "./supplier.schema";
import { taxDB } from "./tax.schema";
import { unitsDB } from "./unit.schema";
import { userDB } from "./user.schema";

export const PURCHASE_ORDER_STATUSES = [
  "draft",
  "issued",
  "partially_received",
  "received",
  "cancelled",
  "closed",
] as const;
export const PURCHASE_RECEIPT_STATUSES = ["applied", "reversed"] as const;
export const PURCHASE_ORDER_EVENT_TYPES = [
  "created",
  "updated",
  "issued",
  "metadata_updated",
  "cancelled",
  "closed",
  "duplicated",
  "receipt_applied",
  "receipt_reversed",
  "receipt_corrected",
] as const;

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", PURCHASE_ORDER_STATUSES);
export const purchaseReceiptStatusEnum = pgEnum(
  "purchase_receipt_status",
  PURCHASE_RECEIPT_STATUSES,
);
export const purchaseOrderEventTypeEnum = pgEnum(
  "purchase_order_event_type",
  PURCHASE_ORDER_EVENT_TYPES,
);

export const purchaseOrderFolioCountersDB = pgTable("purchase_order_folio_counter", {
  year: integer("year").primaryKey(),
  lastSequence: integer("last_sequence").notNull().default(0),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

export const purchaseOrdersDB = pgTable(
  "purchase_order",
  {
    id: text("id").primaryKey(),
    folio: text("folio").notNull(),
    folioYear: integer("folio_year").notNull(),
    folioSequence: integer("folio_sequence").notNull(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliersDB.id, { onDelete: "restrict" }),
    locationId: text("location_id")
      .notNull()
      .references(() => inventoryLocationsDB.id, { onDelete: "restrict" }),
    status: purchaseOrderStatusEnum("status").notNull().default("draft"),
    currency: text("currency").notNull().default("MXN"),
    supplierNameSnapshot: text("supplier_name_snapshot").notNull(),
    locationNameSnapshot: text("location_name_snapshot").notNull(),
    locationTimezoneSnapshot: text("location_timezone_snapshot").notNull(),
    quoteReference: text("quote_reference"),
    observations: text("observations"),
    expectedDeliveryOn: date("expected_delivery_on", { mode: "string" }),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => userDB.id, { onDelete: "restrict" }),
    issuedAt: timestamp("issued_at", { mode: "date", withTimezone: true }),
    issuedByUserId: text("issued_by_user_id").references(() => userDB.id, {
      onDelete: "restrict",
    }),
    cancelledAt: timestamp("cancelled_at", { mode: "date", withTimezone: true }),
    cancelledByUserId: text("cancelled_by_user_id").references(() => userDB.id, {
      onDelete: "restrict",
    }),
    cancellationReason: text("cancellation_reason"),
    closedAt: timestamp("closed_at", { mode: "date", withTimezone: true }),
    closedByUserId: text("closed_by_user_id").references(() => userDB.id, {
      onDelete: "restrict",
    }),
    closeReason: text("close_reason"),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("purchase_order_folio_unique").on(table.folio),
    uniqueIndex("purchase_order_year_sequence_unique").on(table.folioYear, table.folioSequence),
    check("purchase_order_currency_mxn_check", sql`${table.currency} = 'MXN'`),
    check(
      "purchase_order_totals_non_negative_check",
      sql`${table.subtotalCents} >= 0 and ${table.taxCents} >= 0 and ${table.totalCents} >= 0 and ${table.totalCents} = ${table.subtotalCents} + ${table.taxCents}`,
    ),
    check(
      "purchase_order_issue_consistency_check",
      sql`(${table.status} = 'draft' and ${table.issuedAt} is null and ${table.issuedByUserId} is null) or (${table.status} <> 'draft' and ${table.issuedAt} is not null and ${table.issuedByUserId} is not null)`,
    ),
    check(
      "purchase_order_cancel_consistency_check",
      sql`(${table.status} = 'cancelled' and ${table.cancelledAt} is not null and ${table.cancelledByUserId} is not null and nullif(btrim(${table.cancellationReason}), '') is not null) or (${table.status} <> 'cancelled' and ${table.cancelledAt} is null and ${table.cancelledByUserId} is null and ${table.cancellationReason} is null)`,
    ),
    check(
      "purchase_order_close_consistency_check",
      sql`(${table.status} = 'closed' and ${table.closedAt} is not null and ${table.closedByUserId} is not null and nullif(btrim(${table.closeReason}), '') is not null) or (${table.status} <> 'closed' and ${table.closedAt} is null and ${table.closedByUserId} is null and ${table.closeReason} is null)`,
    ),
    index("purchase_order_supplier_id_idx").on(table.supplierId),
    index("purchase_order_location_status_idx").on(table.locationId, table.status),
    index("purchase_order_created_at_idx").on(table.createdAt),
    index("purchase_order_expected_delivery_on_idx").on(table.expectedDeliveryOn),
  ],
);

export const purchaseOrderItemsDB = pgTable(
  "purchase_order_item",
  {
    id: text("id").primaryKey(),
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => purchaseOrdersDB.id, { onDelete: "cascade" }),
    supplierItemId: text("supplier_item_id")
      .notNull()
      .references(() => supplierItemsDB.id, { onDelete: "restrict" }),
    presentationId: text("presentation_id")
      .notNull()
      .references(() => supplierItemPresentationsDB.id, { onDelete: "restrict" }),
    inventoryItemId: text("inventory_item_id").references(() => inventoryItemsDB.id, {
      onDelete: "restrict",
    }),
    isTrackedSnapshot: boolean("is_tracked_snapshot").notNull(),
    tracksLotsSnapshot: boolean("tracks_lots_snapshot").notNull(),
    isPerishableSnapshot: boolean("is_perishable_snapshot").notNull(),
    itemType: text("item_type", { enum: ["ingredient", "supply"] }).notNull(),
    itemNameSnapshot: text("item_name_snapshot").notNull(),
    presentationNameSnapshot: text("presentation_name_snapshot").notNull(),
    baseUnitId: text("base_unit_id")
      .notNull()
      .references(() => unitsDB.id, { onDelete: "restrict" }),
    baseUnitNameSnapshot: text("base_unit_name_snapshot").notNull(),
    baseUnitAbbreviationSnapshot: text("base_unit_abbreviation_snapshot").notNull(),
    baseUnitPrecisionSnapshot: integer("base_unit_precision_snapshot").notNull(),
    contentQuantitySnapshot: numeric("content_quantity_snapshot", {
      precision: 14,
      scale: 6,
      mode: "number",
    }).notNull(),
    orderedPresentationQuantity: numeric("ordered_presentation_quantity", {
      precision: 14,
      scale: 6,
      mode: "number",
    }).notNull(),
    receivedPresentationQuantity: numeric("received_presentation_quantity", {
      precision: 14,
      scale: 6,
      mode: "number",
    })
      .notNull()
      .default(0),
    unitPriceCents: integer("unit_price_cents").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    taxCents: integer("tax_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("purchase_order_item_presentation_unique").on(
      table.purchaseOrderId,
      table.presentationId,
    ),
    check("purchase_order_item_type_check", sql`${table.itemType} in ('ingredient', 'supply')`),
    check(
      "purchase_order_item_quantity_positive_check",
      sql`${table.orderedPresentationQuantity} > 0 and ${table.receivedPresentationQuantity} >= 0 and ${table.receivedPresentationQuantity} <= ${table.orderedPresentationQuantity}`,
    ),
    check(
      "purchase_order_item_quantity_precision_check",
      sql`scale(${table.orderedPresentationQuantity}) <= ${sql.raw(String(MAX_SUPPORTED_DECIMAL_PLACES))} and scale(${table.receivedPresentationQuantity}) <= ${sql.raw(String(MAX_SUPPORTED_DECIMAL_PLACES))}`,
    ),
    check("purchase_order_item_content_positive_check", sql`${table.contentQuantitySnapshot} > 0`),
    check(
      "purchase_order_item_money_check",
      sql`${table.unitPriceCents} >= 0 and ${table.subtotalCents} >= 0 and ${table.taxCents} >= 0 and ${table.totalCents} = ${table.subtotalCents} + ${table.taxCents}`,
    ),
    check(
      "purchase_order_item_base_precision_check",
      sql`${table.baseUnitPrecisionSnapshot} between 0 and ${sql.raw(String(MAX_SUPPORTED_DECIMAL_PLACES))}`,
    ),
    index("purchase_order_item_order_sort_idx").on(table.purchaseOrderId, table.sortOrder),
    index("purchase_order_item_inventory_item_id_idx").on(table.inventoryItemId),
  ],
);

export const purchaseOrderItemTaxesDB = pgTable(
  "purchase_order_item_tax",
  {
    purchaseOrderItemId: text("purchase_order_item_id")
      .notNull()
      .references(() => purchaseOrderItemsDB.id, { onDelete: "cascade" }),
    taxId: text("tax_id")
      .notNull()
      .references(() => taxDB.id, { onDelete: "restrict" }),
    taxNameSnapshot: text("tax_name_snapshot").notNull(),
    taxRateBpsSnapshot: integer("tax_rate_bps_snapshot").notNull(),
    taxAmountCents: integer("tax_amount_cents").notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "purchase_order_item_tax_pk",
      columns: [table.purchaseOrderItemId, table.taxId],
    }),
    check(
      "purchase_order_item_tax_rate_check",
      sql`${table.taxRateBpsSnapshot} between 0 and 10000 and ${table.taxAmountCents} >= 0`,
    ),
    index("purchase_order_item_tax_tax_id_idx").on(table.taxId),
  ],
);

export const purchaseReceiptsDB = pgTable(
  "purchase_receipt",
  {
    id: text("id").primaryKey(),
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => purchaseOrdersDB.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    folio: text("folio").notNull(),
    status: purchaseReceiptStatusEnum("status").notNull().default("applied"),
    receivedOn: date("received_on", { mode: "string" }).notNull(),
    supplierDocumentReference: text("supplier_document_reference"),
    observations: text("observations"),
    inventoryMovementId: text("inventory_movement_id").references(() => inventoryMovementsDB.id, {
      onDelete: "restrict",
    }),
    correctsReceiptId: text("corrects_receipt_id"),
    replacementReceiptId: text("replacement_receipt_id"),
    receivedByUserId: text("received_by_user_id")
      .notNull()
      .references(() => userDB.id, { onDelete: "restrict" }),
    reversedAt: timestamp("reversed_at", { mode: "date", withTimezone: true }),
    reversedByUserId: text("reversed_by_user_id").references(() => userDB.id, {
      onDelete: "restrict",
    }),
    reversalReason: text("reversal_reason"),
    reversalInventoryMovementId: text("reversal_inventory_movement_id").references(
      () => inventoryMovementsDB.id,
      { onDelete: "restrict" },
    ),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("purchase_receipt_folio_unique").on(table.folio),
    uniqueIndex("purchase_receipt_order_sequence_unique").on(table.purchaseOrderId, table.sequence),
    check("purchase_receipt_sequence_positive_check", sql`${table.sequence} > 0`),
    check(
      "purchase_receipt_totals_non_negative_check",
      sql`${table.subtotalCents} >= 0 and ${table.taxCents} >= 0 and ${table.totalCents} = ${table.subtotalCents} + ${table.taxCents}`,
    ),
    check(
      "purchase_receipt_reversal_consistency_check",
      sql`(${table.status} = 'applied' and ${table.reversedAt} is null and ${table.reversedByUserId} is null and ${table.reversalReason} is null and ${table.reversalInventoryMovementId} is null) or (${table.status} = 'reversed' and ${table.reversedAt} is not null and ${table.reversedByUserId} is not null and nullif(btrim(${table.reversalReason}), '') is not null)`,
    ),
    index("purchase_receipt_order_created_at_idx").on(table.purchaseOrderId, table.createdAt),
    index("purchase_receipt_received_on_idx").on(table.receivedOn),
  ],
);

export const purchaseReceiptAllocationsDB = pgTable(
  "purchase_receipt_allocation",
  {
    id: text("id").primaryKey(),
    receiptId: text("receipt_id")
      .notNull()
      .references(() => purchaseReceiptsDB.id, { onDelete: "restrict" }),
    purchaseOrderItemId: text("purchase_order_item_id")
      .notNull()
      .references(() => purchaseOrderItemsDB.id, { onDelete: "restrict" }),
    inventoryItemId: text("inventory_item_id").references(() => inventoryItemsDB.id, {
      onDelete: "restrict",
    }),
    lotId: text("lot_id").references(() => inventoryLotsDB.id, { onDelete: "restrict" }),
    presentationQuantity: numeric("presentation_quantity", {
      precision: 14,
      scale: 6,
      mode: "number",
    }).notNull(),
    baseQuantity: numeric("base_quantity", {
      precision: 14,
      scale: 6,
      mode: "number",
    }).notNull(),
    lotCodeSnapshot: text("lot_code_snapshot"),
    expiresOnSnapshot: date("expires_on_snapshot", { mode: "string" }),
    unitPriceCentsSnapshot: integer("unit_price_cents_snapshot").notNull(),
    contentQuantitySnapshot: numeric("content_quantity_snapshot", {
      precision: 14,
      scale: 6,
      mode: "number",
    }).notNull(),
    baseUnitCost: numeric("base_unit_cost", {
      precision: 18,
      scale: 8,
      mode: "number",
    }).notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    taxCents: integer("tax_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    check(
      "purchase_receipt_allocation_quantity_positive_check",
      sql`${table.presentationQuantity} > 0 and ${table.baseQuantity} > 0`,
    ),
    check(
      "purchase_receipt_allocation_quantity_precision_check",
      sql`scale(${table.presentationQuantity}) <= ${sql.raw(String(MAX_SUPPORTED_DECIMAL_PLACES))} and scale(${table.baseQuantity}) <= ${sql.raw(String(MAX_SUPPORTED_DECIMAL_PLACES))}`,
    ),
    check(
      "purchase_receipt_allocation_money_check",
      sql`${table.unitPriceCentsSnapshot} >= 0 and ${table.baseUnitCost} >= 0 and ${table.subtotalCents} >= 0 and ${table.taxCents} >= 0 and ${table.totalCents} = ${table.subtotalCents} + ${table.taxCents}`,
    ),
    check(
      "purchase_receipt_allocation_inventory_pair_check",
      sql`(${table.inventoryItemId} is null and ${table.lotId} is null) or (${table.inventoryItemId} is not null and ${table.lotId} is not null)`,
    ),
    index("purchase_receipt_allocation_receipt_id_idx").on(table.receiptId),
    index("purchase_receipt_allocation_order_item_id_idx").on(table.purchaseOrderItemId),
    index("purchase_receipt_allocation_inventory_item_id_idx").on(table.inventoryItemId),
  ],
);

export const purchaseOrderEventsDB = pgTable(
  "purchase_order_event",
  {
    id: text("id").primaryKey(),
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => purchaseOrdersDB.id, { onDelete: "cascade" }),
    type: purchaseOrderEventTypeEnum("type").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => userDB.id, { onDelete: "restrict" }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("purchase_order_event_order_created_at_idx").on(table.purchaseOrderId, table.createdAt),
  ],
);

export type PurchaseOrderStatus = (typeof purchaseOrderStatusEnum.enumValues)[number];
export type PurchaseReceiptStatus = (typeof purchaseReceiptStatusEnum.enumValues)[number];
export type PurchaseOrderEventType = (typeof purchaseOrderEventTypeEnum.enumValues)[number];
export type PurchaseOrder = typeof purchaseOrdersDB.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItemsDB.$inferSelect;
export type PurchaseReceipt = typeof purchaseReceiptsDB.$inferSelect;
