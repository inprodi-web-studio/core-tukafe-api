import type { GuestProductCategoryListItem } from "../productCategories.types";
import { z } from "zod";

const listItemSchema: z.ZodType<GuestProductCategoryListItem> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    icon: z.string(),
    color: z.string(),
    children: z.array(listItemSchema),
  }),
);

export const listResponseSchema = z.array(listItemSchema);

export type ListResponse = z.infer<typeof listResponseSchema>;
