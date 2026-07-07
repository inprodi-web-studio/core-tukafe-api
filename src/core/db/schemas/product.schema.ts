import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { generateTimestamps } from "@core/utils";
import { organizationDB } from "./organization.schema";
import { productCategoriesDB } from "./productCategory.schema";
import { taxDB } from "./tax.schema";
import { unitsDB } from "./unit.schema";
import { uploadsDB } from "./upload.schema";

export const PRODUCT_TYPES = ["simple", "assembled", "compound"] as const;

export const productTypeEnum = pgEnum("product_type", PRODUCT_TYPES);

const products = pgTable(
  "product",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kitchenName: text("kitchen_name"),
    priceCents: integer("price_cents"),
    customerDescription: text("customer_description"),
    kitchenDescription: text("kitchen_description"),
    unitId: text("unit_id")
      .notNull()
      .references(() => unitsDB.id, { onDelete: "restrict" }),
    categoryId: text("category_id").references(() => productCategoriesDB.id, {
      onDelete: "restrict",
    }),
    imageUploadId: text("image_upload_id").references(() => uploadsDB.id, {
      onDelete: "restrict",
    }),
    isFeatured: boolean("is_featured").notNull().default(false),
    productType: productTypeEnum("product_type").notNull().default("simple"),
    ...generateTimestamps({ withDeletedAt: true }),
  },
  (table) => [
    check("product_price_cents_non_negative_check", sql`${table.priceCents} >= 0`),
    uniqueIndex("product_name_active_unique")
      .on(table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    index("product_name_idx").on(table.name),
    index("product_unit_id_idx").on(table.unitId),
    index("product_category_id_idx").on(table.categoryId),
    index("product_is_featured_idx").on(table.isFeatured),
    index("product_image_upload_id_idx").on(table.imageUploadId),
    index("product_product_type_idx").on(table.productType),
  ],
);

const productTax = pgTable(
  "product_tax",
  {
    productId: text("product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "cascade" }),
    taxId: text("tax_id")
      .notNull()
      .references(() => taxDB.id, { onDelete: "cascade" }),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "product_tax_pk",
      columns: [table.productId, table.taxId],
    }),
    index("product_tax_product_id_idx").on(table.productId),
    index("product_tax_tax_id_idx").on(table.taxId),
  ],
);

const productCategoryLink = pgTable(
  "product_category_link",
  {
    productId: text("product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => productCategoriesDB.id, { onDelete: "cascade" }),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "product_category_link_pk",
      columns: [table.productId, table.categoryId],
    }),
    index("product_category_link_product_id_idx").on(table.productId),
    index("product_category_link_category_id_idx").on(table.categoryId),
  ],
);

const organizationProduct = pgTable(
  "organization_product",
  {
    productId: text("product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationDB.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").notNull().default(true),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "organization_product_pk",
      columns: [table.productId, table.organizationId],
    }),
    index("organization_product_organization_id_idx").on(table.organizationId),
    index("organization_product_organization_active_idx")
      .on(table.organizationId)
      .where(sql`${table.isActive} = true`),
  ],
);

const productCompoundComponents = pgTable(
  "product_compound_component",
  {
    compoundProductId: text("compound_product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "cascade" }),
    componentProductId: text("component_product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
    sortOrder: integer("sort_order").notNull(),
    label: text("label"),
    ...generateTimestamps(),
  },
  (table) => [
    primaryKey({
      name: "product_compound_component_pk",
      columns: [table.compoundProductId, table.sortOrder],
    }),
    uniqueIndex("product_compound_component_product_component_sort_unique").on(
      table.compoundProductId,
      table.componentProductId,
      table.sortOrder,
    ),
    index("product_compound_component_compound_product_id_idx").on(table.compoundProductId),
    index("product_compound_component_component_product_id_idx").on(table.componentProductId),
    check("product_compound_component_quantity_positive_check", sql`${table.quantity} > 0`),
    check("product_compound_component_sort_order_non_negative_check", sql`${table.sortOrder} >= 0`),
    check(
      "product_compound_component_no_self_reference_check",
      sql`${table.compoundProductId} <> ${table.componentProductId}`,
    ),
  ],
);

const productCompoundSlots = pgTable(
  "product_compound_slot",
  {
    id: text("id").primaryKey(),
    compoundProductId: text("compound_product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    quantity: integer("quantity").notNull().default(1),
    sortOrder: integer("sort_order").notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("product_compound_slot_product_sort_unique").on(
      table.compoundProductId,
      table.sortOrder,
    ),
    index("product_compound_slot_compound_product_id_idx").on(table.compoundProductId),
    check("product_compound_slot_quantity_positive_check", sql`${table.quantity} > 0`),
    check("product_compound_slot_sort_order_non_negative_check", sql`${table.sortOrder} >= 0`),
  ],
);

const productCompoundSlotOptions = pgTable(
  "product_compound_slot_option",
  {
    id: text("id").primaryKey(),
    slotId: text("slot_id")
      .notNull()
      .references(() => productCompoundSlots.id, { onDelete: "cascade" }),
    componentProductId: text("component_product_id")
      .notNull()
      .references(() => productsDB.id, { onDelete: "restrict" }),
    label: text("label"),
    sortOrder: integer("sort_order").notNull(),
    ...generateTimestamps(),
  },
  (table) => [
    uniqueIndex("product_compound_slot_option_slot_sort_unique").on(
      table.slotId,
      table.sortOrder,
    ),
    uniqueIndex("product_compound_slot_option_slot_product_unique").on(
      table.slotId,
      table.componentProductId,
    ),
    index("product_compound_slot_option_slot_id_idx").on(table.slotId),
    index("product_compound_slot_option_component_product_id_idx").on(table.componentProductId),
    check(
      "product_compound_slot_option_sort_order_non_negative_check",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const productsDB = products;
export const productTaxDB = productTax;
export const productCategoryLinksDB = productCategoryLink;
export const organizationProductDB = organizationProduct;
export const productCompoundComponentsDB = productCompoundComponents;
export const productCompoundSlotsDB = productCompoundSlots;
export const productCompoundSlotOptionsDB = productCompoundSlotOptions;
export const productsRelations = relations(productsDB, ({ one, many }) => ({
  unit: one(unitsDB, {
    fields: [productsDB.unitId],
    references: [unitsDB.id],
  }),
  category: one(productCategoriesDB, {
    fields: [productsDB.categoryId],
    references: [productCategoriesDB.id],
  }),
  image: one(uploadsDB, {
    fields: [productsDB.imageUploadId],
    references: [uploadsDB.id],
  }),
  taxes: many(productTaxDB),
  categories: many(productCategoryLinksDB),
  organizations: many(organizationProductDB),
  compoundComponents: many(productCompoundComponentsDB, {
    relationName: "compoundProductComponents",
  }),
  compoundParents: many(productCompoundComponentsDB, {
    relationName: "componentProductParents",
  }),
  compoundSlots: many(productCompoundSlotsDB, {
    relationName: "compoundProductSlots",
  }),
  compoundSlotOptions: many(productCompoundSlotOptionsDB, {
    relationName: "compoundSlotOptionProducts",
  }),
}));
export const productTaxRelations = relations(productTaxDB, ({ one }) => ({
  product: one(productsDB, {
    fields: [productTaxDB.productId],
    references: [productsDB.id],
  }),
  tax: one(taxDB, {
    fields: [productTaxDB.taxId],
    references: [taxDB.id],
  }),
}));
export const productCategoryLinksRelations = relations(productCategoryLinksDB, ({ one }) => ({
  product: one(productsDB, {
    fields: [productCategoryLinksDB.productId],
    references: [productsDB.id],
  }),
  category: one(productCategoriesDB, {
    fields: [productCategoryLinksDB.categoryId],
    references: [productCategoriesDB.id],
  }),
}));
export const organizationProductRelations = relations(organizationProductDB, ({ one }) => ({
  product: one(productsDB, {
    fields: [organizationProductDB.productId],
    references: [productsDB.id],
  }),
  organization: one(organizationDB, {
    fields: [organizationProductDB.organizationId],
    references: [organizationDB.id],
  }),
}));
export const productCompoundComponentsRelations = relations(
  productCompoundComponentsDB,
  ({ one }) => ({
    compoundProduct: one(productsDB, {
      fields: [productCompoundComponentsDB.compoundProductId],
      references: [productsDB.id],
      relationName: "compoundProductComponents",
    }),
    componentProduct: one(productsDB, {
      fields: [productCompoundComponentsDB.componentProductId],
      references: [productsDB.id],
      relationName: "componentProductParents",
    }),
  }),
);
export const productCompoundSlotsRelations = relations(productCompoundSlotsDB, ({ one, many }) => ({
  compoundProduct: one(productsDB, {
    fields: [productCompoundSlotsDB.compoundProductId],
    references: [productsDB.id],
    relationName: "compoundProductSlots",
  }),
  options: many(productCompoundSlotOptionsDB),
}));
export const productCompoundSlotOptionsRelations = relations(
  productCompoundSlotOptionsDB,
  ({ one }) => ({
    slot: one(productCompoundSlotsDB, {
      fields: [productCompoundSlotOptionsDB.slotId],
      references: [productCompoundSlotsDB.id],
    }),
    componentProduct: one(productsDB, {
      fields: [productCompoundSlotOptionsDB.componentProductId],
      references: [productsDB.id],
      relationName: "compoundSlotOptionProducts",
    }),
  }),
);

export type Product = typeof productsDB.$inferSelect;
export type ProductTax = typeof productTaxDB.$inferSelect;
export type ProductCategoryLink = typeof productCategoryLinksDB.$inferSelect;
export type OrganizationProduct = typeof organizationProductDB.$inferSelect;
export type ProductCompoundComponent = typeof productCompoundComponentsDB.$inferSelect;
export type ProductCompoundSlot = typeof productCompoundSlotsDB.$inferSelect;
export type ProductCompoundSlotOption = typeof productCompoundSlotOptionsDB.$inferSelect;
export type ProductType = (typeof productTypeEnum.enumValues)[number];
