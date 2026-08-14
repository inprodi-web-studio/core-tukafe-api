import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { ingredientsDB } from "./ingredient.schema";
import { suppliesDB } from "./supply.schema";
import { userDB } from "./user.schema";

const suppliers = pgTable(
  "supplier",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [
    uniqueIndex("supplier_name_active_unique")
      .on(table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("supplier_email_active_unique")
      .on(table.email)
      .where(sql`${table.deletedAt} IS NULL AND ${table.email} IS NOT NULL`),
    uniqueIndex("supplier_phone_active_unique")
      .on(table.phone)
      .where(sql`${table.deletedAt} IS NULL AND ${table.phone} IS NOT NULL`),
    index("supplier_name_idx").on(table.name),
    index("supplier_email_idx").on(table.email),
    index("supplier_phone_idx").on(table.phone),
  ],
);

const supplierItems = pgTable(
  "supplier_item",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    ingredientId: text("ingredient_id").references(() => ingredientsDB.id, {
      onDelete: "restrict",
    }),
    supplyId: text("supply_id").references(() => suppliesDB.id, {
      onDelete: "restrict",
    }),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [
    check(
      "supplier_item_exactly_one_catalog_item_check",
      sql`num_nonnulls(${table.ingredientId}, ${table.supplyId}) = 1`,
    ),
    uniqueIndex("supplier_item_active_ingredient_unique")
      .on(table.supplierId, table.ingredientId)
      .where(sql`${table.deletedAt} IS NULL AND ${table.ingredientId} IS NOT NULL`),
    uniqueIndex("supplier_item_active_supply_unique")
      .on(table.supplierId, table.supplyId)
      .where(sql`${table.deletedAt} IS NULL AND ${table.supplyId} IS NOT NULL`),
    index("supplier_item_supplier_id_idx").on(table.supplierId),
    index("supplier_item_ingredient_id_idx").on(table.ingredientId),
    index("supplier_item_supply_id_idx").on(table.supplyId),
  ],
);

const supplierItemPresentations = pgTable(
  "supplier_item_presentation",
  {
    id: text("id").primaryKey(),
    supplierItemId: text("supplier_item_id")
      .notNull()
      .references(() => supplierItems.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    contentQuantity: numeric("content_quantity", {
      precision: 14,
      scale: 6,
      mode: "number",
    }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [
    check("supplier_item_presentation_content_positive_check", sql`${table.contentQuantity} > 0`),
    uniqueIndex("supplier_item_presentation_active_name_unique")
      .on(table.supplierItemId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("supplier_item_presentation_active_default_unique")
      .on(table.supplierItemId)
      .where(sql`${table.deletedAt} IS NULL AND ${table.isDefault} = true`),
    index("supplier_item_presentation_supplier_item_id_idx").on(table.supplierItemId),
  ],
);

const supplierPresentationCosts = pgTable(
  "supplier_presentation_cost",
  {
    id: text("id").primaryKey(),
    presentationId: text("presentation_id")
      .notNull()
      .references(() => supplierItemPresentations.id, { onDelete: "restrict" }),
    priceCents: integer("price_cents").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => userDB.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("supplier_presentation_cost_price_positive_check", sql`${table.priceCents} > 0`),
    check(
      "supplier_presentation_cost_interval_check",
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
    uniqueIndex("supplier_presentation_cost_current_unique")
      .on(table.presentationId)
      .where(sql`${table.effectiveTo} IS NULL`),
    index("supplier_presentation_cost_presentation_id_idx").on(table.presentationId),
    index("supplier_presentation_cost_effective_from_idx").on(table.effectiveFrom),
  ],
);

export const suppliersDB = suppliers;
export const supplierItemsDB = supplierItems;
export const supplierItemPresentationsDB = supplierItemPresentations;
export const supplierPresentationCostsDB = supplierPresentationCosts;

export const suppliersRelations = relations(suppliersDB, ({ many }) => ({
  items: many(supplierItemsDB),
}));

export const supplierItemsRelations = relations(supplierItemsDB, ({ one, many }) => ({
  supplier: one(suppliersDB, {
    fields: [supplierItemsDB.supplierId],
    references: [suppliersDB.id],
  }),
  ingredient: one(ingredientsDB, {
    fields: [supplierItemsDB.ingredientId],
    references: [ingredientsDB.id],
  }),
  supply: one(suppliesDB, {
    fields: [supplierItemsDB.supplyId],
    references: [suppliesDB.id],
  }),
  presentations: many(supplierItemPresentationsDB),
}));

export const supplierItemPresentationsRelations = relations(
  supplierItemPresentationsDB,
  ({ one, many }) => ({
    supplierItem: one(supplierItemsDB, {
      fields: [supplierItemPresentationsDB.supplierItemId],
      references: [supplierItemsDB.id],
    }),
    costs: many(supplierPresentationCostsDB),
  }),
);

export const supplierPresentationCostsRelations = relations(
  supplierPresentationCostsDB,
  ({ one }) => ({
    presentation: one(supplierItemPresentationsDB, {
      fields: [supplierPresentationCostsDB.presentationId],
      references: [supplierItemPresentationsDB.id],
    }),
    createdBy: one(userDB, {
      fields: [supplierPresentationCostsDB.createdByUserId],
      references: [userDB.id],
    }),
  }),
);

export type Supplier = typeof suppliersDB.$inferSelect;
export type SupplierItem = typeof supplierItemsDB.$inferSelect;
export type SupplierItemPresentation = typeof supplierItemPresentationsDB.$inferSelect;
export type SupplierPresentationCost = typeof supplierPresentationCostsDB.$inferSelect;
