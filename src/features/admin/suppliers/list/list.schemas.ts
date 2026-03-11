import { createPaginatedResponseSchema } from "@core/utils";
import { z } from "zod";

const listItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
});

export const listResponseSchema = createPaginatedResponseSchema(listItemSchema);

export type ListResponse = z.infer<typeof listResponseSchema>;
