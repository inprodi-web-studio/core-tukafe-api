import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";

const listItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  rate: z.number().min(0).max(100),
});

export const listResponseSchema = createPaginatedResponseSchema(listItemSchema);

export type ListResponse = z.infer<typeof listResponseSchema>;
