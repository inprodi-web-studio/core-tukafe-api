import { createPaginatedResponseSchema, hasAtMostDecimalPlaces, phoneSchema } from "@core/utils";
import { z } from "zod";

export const supplierStatusSchema = z.enum(["active", "inactive"]);
export const supplierSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email().nullable(),
  phone: z.string().nullable(),
  status: supplierStatusSchema,
  ingredientCount: z.number().int().nonnegative(),
  supplyCount: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(120).optional().nullable(),
    status: z.enum(["all", "active", "inactive"]).default("active"),
  })
  .strict();

export const supplierListResponseSchema = createPaginatedResponseSchema(supplierSchema);

export const createSupplierBodySchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    email: z.email().nullable().optional(),
    phone: phoneSchema.nullable().optional(),
  })
  .strict();

export const updateSupplierBodySchema = createSupplierBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const supplierParamsSchema = z.object({ supplierId: z.string().trim().min(1) }).strict();
export const supplierItemParamsSchema = supplierParamsSchema
  .extend({
    supplierItemId: z.string().trim().min(1),
  })
  .strict();
export const presentationParamsSchema = supplierItemParamsSchema
  .extend({
    presentationId: z.string().trim().min(1),
  })
  .strict();

const moneyCentsSchema = z.number().int().min(1);
const quantitySchema = z
  .number()
  .positive()
  .refine((value) => hasAtMostDecimalPlaces(value, 6), {
    message: "Content quantity supports at most 6 decimal places",
  });

export const presentationInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    contentQuantity: quantitySchema,
    priceCents: moneyCentsSchema,
    note: z.string().trim().max(500).nullable().optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const assignItemBodySchema = z
  .object({
    itemType: z.enum(["ingredient", "supply"]),
    itemId: z.string().trim().min(1),
    presentation: presentationInputSchema.omit({ isDefault: true }),
  })
  .strict();

export const itemListQuerySchema = listQuerySchema
  .extend({
    itemType: z.enum(["ingredient", "supply"]),
  })
  .strict();

export const costBodySchema = z
  .object({
    priceCents: moneyCentsSchema,
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const paginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const costSchema = z.object({
  id: z.string(),
  priceCents: z.number().int().positive(),
  unitCostPerBaseUnit: z.number().nonnegative(),
  effectiveFrom: z.date(),
  effectiveTo: z.date().nullable(),
  note: z.string().nullable(),
  createdBy: z.object({ id: z.string(), name: z.string(), email: z.email() }).nullable(),
});

export const presentationSchema = z.object({
  id: z.string(),
  name: z.string(),
  contentQuantity: z.number().positive(),
  isDefault: z.boolean(),
  status: supplierStatusSchema,
  currentCost: costSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const supplierItemSchema = z.object({
  id: z.string(),
  itemType: z.enum(["ingredient", "supply"]),
  status: supplierStatusSchema,
  item: z.object({
    id: z.string(),
    name: z.string(),
    baseUnit: z.object({
      id: z.string(),
      name: z.string(),
      abbreviation: z.string(),
      precision: z.number().int().min(0).max(6),
    }),
  }),
  presentations: z.array(presentationSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const supplierItemListResponseSchema = createPaginatedResponseSchema(supplierItemSchema);
export const costListResponseSchema = createPaginatedResponseSchema(costSchema);

export type ListQuery = z.infer<typeof listQuerySchema>;
export type CreateSupplierBody = z.infer<typeof createSupplierBodySchema>;
export type UpdateSupplierBody = z.infer<typeof updateSupplierBodySchema>;
export type SupplierParams = z.infer<typeof supplierParamsSchema>;
export type SupplierItemParams = z.infer<typeof supplierItemParamsSchema>;
export type PresentationParams = z.infer<typeof presentationParamsSchema>;
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;
export type AssignItemBody = z.infer<typeof assignItemBodySchema>;
export type PresentationInputBody = z.infer<typeof presentationInputSchema>;
export type CostBody = z.infer<typeof costBodySchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
