import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";
import { compoundOptionSchema } from "../get/get.schemas";

export const paramsSchema = z
  .object({
    productId: z.nanoid(),
  })
  .strict();

export const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
    search: z.string().trim().optional().nullable(),
  })
  .strict();

export const responseSchema = createPaginatedResponseSchema(compoundOptionSchema);

export type Params = z.infer<typeof paramsSchema>;
export type Query = z.infer<typeof querySchema>;
