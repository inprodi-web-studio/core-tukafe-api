import { sql } from "drizzle-orm";
import {
  bigint,
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
import {
  inventoryItemsDB,
  inventoryLocationsDB,
  inventoryLotsDB,
  inventoryMovementsDB,
} from "./inventory.schema";
import { userDB } from "./user.schema";
export interface InventoryCountItemSnapshot {
  id: string;
  kind: "ingredient" | "supply" | "product" | "variation";
  name: string;
  isTracked: boolean;
  tracksLots: boolean;
  isPerishable: boolean;
  unit: { id: string; name: string; abbreviation: string; precision: number };
}

export const inventoryCountStatusEnum = pgEnum("inventory_count_status", [
  "draft",
  "applied",
  "cancelled",
]);

export const inventoryStockRevisionsDB = pgTable(
  "inventory_stock_revision",
  {
    locationId: text("location_id")
      .notNull()
      .references(() => inventoryLocationsDB.id, { onDelete: "restrict" }),
    inventoryItemId: text("inventory_item_id")
      .notNull()
      .references(() => inventoryItemsDB.id, { onDelete: "restrict" }),
    revision: bigint("revision", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    primaryKey({
      name: "inventory_stock_revision_pkey",
      columns: [t.locationId, t.inventoryItemId],
    }),
  ],
);

export const inventoryCountsDB = pgTable(
  "inventory_count",
  {
    id: text("id").primaryKey(),
    locationId: text("location_id")
      .notNull()
      .references(() => inventoryLocationsDB.id, { onDelete: "restrict" }),
    status: inventoryCountStatusEnum("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    observations: text("observations"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => userDB.id, { onDelete: "restrict" }),
    appliedByUserId: text("applied_by_user_id").references(() => userDB.id, {
      onDelete: "restrict",
    }),
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "date" }),
    cancelledByUserId: text("cancelled_by_user_id").references(() => userDB.id, {
      onDelete: "restrict",
    }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    movementId: text("movement_id").references(() => inventoryMovementsDB.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("inventory_count_location_created_idx").on(t.locationId, t.createdAt),
    check(
      "inventory_count_state_check",
      sql`(${t.status} = 'draft' and ${t.appliedAt} is null and ${t.cancelledAt} is null) or (${t.status} = 'applied' and ${t.appliedAt} is not null and ${t.appliedByUserId} is not null and ${t.cancelledAt} is null) or (${t.status} = 'cancelled' and ${t.cancelledAt} is not null and ${t.cancelledByUserId} is not null and ${t.appliedAt} is null)`,
    ),
  ],
);

export const inventoryCountItemsDB = pgTable(
  "inventory_count_item",
  {
    id: text("id").primaryKey(),
    countId: text("count_id")
      .notNull()
      .references(() => inventoryCountsDB.id, { onDelete: "restrict" }),
    inventoryItemId: text("inventory_item_id")
      .notNull()
      .references(() => inventoryItemsDB.id, { onDelete: "restrict" }),
    snapshot: jsonb("snapshot").$type<InventoryCountItemSnapshot>().notNull(),
    stockRevision: bigint("stock_revision", { mode: "number" }).notNull(),
    referenceAt: timestamp("reference_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [
    index("inventory_count_item_count_idx").on(t.countId),
    uniqueIndex("inventory_count_item_unique").on(t.countId, t.inventoryItemId),
  ],
);

export const inventoryCountLinesDB = pgTable(
  "inventory_count_line",
  {
    id: text("id").primaryKey(),
    countItemId: text("count_item_id")
      .notNull()
      .references(() => inventoryCountItemsDB.id, { onDelete: "restrict" }),
    lotId: text("lot_id").references(() => inventoryLotsDB.id, { onDelete: "restrict" }),
    lotCode: text("lot_code"),
    expiresOn: date("expires_on", { mode: "string" }),
    systemQuantity: numeric("system_quantity", {
      precision: 12,
      scale: 6,
      mode: "number",
    }).notNull(),
    countedQuantity: numeric("counted_quantity", { precision: 12, scale: 6, mode: "number" }),
    previousCountedQuantity: numeric("previous_counted_quantity", {
      precision: 12,
      scale: 6,
      mode: "number",
    }),
    appliedDelta: numeric("applied_delta", { precision: 12, scale: 6, mode: "number" }),
  },
  (t) => [
    index("inventory_count_line_item_idx").on(t.countItemId),
    check(
      "inventory_count_line_quantity_check",
      sql`${t.systemQuantity} >= 0 and (${t.countedQuantity} is null or ${t.countedQuantity} >= 0)`,
    ),
  ],
);
