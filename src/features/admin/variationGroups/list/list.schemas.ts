import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";

export const listQueryParamsSchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().trim().optional().nullable(),
  })
  .strict();

export type ListQueryParams = z.infer<typeof listQueryParamsSchema>;

const imageSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),
  mimeType: z.string(),
});

const listItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  customerLabel: z.string().nullable(),
  sortOrder: z.number().int().min(0),
  options: z.array(
    z.object({
      id: z.string(),
      variationGroupId: z.string(),
      name: z.string(),
      customerDescription: z.string().nullable(),
      image: imageSchema.nullable(),
      sortOrder: z.number().int().min(0),
    }),
  ),
});

export const listResponseSchema = createPaginatedResponseSchema(listItemSchema);

export type ListResponse = z.infer<typeof listResponseSchema>;
