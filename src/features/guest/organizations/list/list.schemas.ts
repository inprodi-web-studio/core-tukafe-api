import { z } from "zod";

export const listItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  address: z.string(),
});

export const listResponseSchema = z.array(listItemSchema);

export type ListResponse = z.infer<typeof listResponseSchema>;
