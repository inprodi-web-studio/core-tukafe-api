import type { ProductCategoryListItem } from "../productCategories.types";
import { z } from "zod";

export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().trim().optional().nullable(),
  })
  .strict();

export type ListQuery = z.infer<typeof listQuerySchema>;

const listItemSchema: z.ZodType<ProductCategoryListItem> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    icon: z.string(),
    color: z.string(),
    children: z.array(listItemSchema),
  }),
);

const paginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export const listResponseSchema = z.object({
  data: z.array(listItemSchema),
  pagination: paginationSchema,
});

export type ListResponse = z.infer<typeof listResponseSchema>;
