import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";

const listItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  baseCostPerUnit: z.number().nonnegative(),
  baseUnit: z.object({
    id: z.string(),
    name: z.string(),
    abbreviation: z.string(),
    precision: z.number(),
  }),
  category: z.object({
    id: z.string(),
    name: z.string(),
    icon: z.string(),
    color: z.string(),
  }),
});

export const listResponseSchema = createPaginatedResponseSchema(listItemSchema);

export type ListResponse = z.infer<typeof listResponseSchema>;
