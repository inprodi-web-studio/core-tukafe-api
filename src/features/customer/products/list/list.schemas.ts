import { z } from "zod";
import { listResponseSchema as guestListResponseSchema } from "@features/guest/products/list/list.schemas";

export const listQuerySchema = z.object({
  organizationId: z.string().nonempty(),
  categoryId: z.string().nonempty().optional(),
});

export const listResponseSchema = z.array(
  guestListResponseSchema.element.extend({
    isFavorite: z.boolean(),
  }),
);

export type ListQuery = z.infer<typeof listQuerySchema>;
export type ListResponse = z.infer<typeof listResponseSchema>;
