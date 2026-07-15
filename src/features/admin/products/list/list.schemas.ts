import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";

export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
    search: z.string().trim().optional().nullable(),
    categoryId: z.string().trim().min(1).optional(),
    productType: z.enum(["simple", "assembled", "compound"]).optional(),
    organizationStatus: z.enum(["active", "inactive", "unassigned"]).optional(),
    sortBy: z.enum(["name", "price", "productType", "updatedAt"]).default("name"),
    sortDirection: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict();

const imageSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  mimeType: z.string(),
});

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});

export const productListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  kitchenName: z.string().nullable(),
  productType: z.enum(["simple", "assembled", "compound"]),
  isFeatured: z.boolean(),
  updatedAt: z.date(),
  image: imageSchema.nullable(),
  categories: z.array(categorySchema),
  minPriceCents: z.number().int().nonnegative().nullable(),
  maxPriceCents: z.number().int().nonnegative().nullable(),
  organizationStatus: z.enum(["active", "inactive", "unassigned"]),
});

export const listResponseSchema = createPaginatedResponseSchema(productListItemSchema);

export type ListQuery = z.infer<typeof listQuerySchema>;
