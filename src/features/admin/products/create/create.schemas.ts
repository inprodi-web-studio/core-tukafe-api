import { PRODUCT_TYPES } from "@core/db/schemas";
import { z } from "zod";

export const createBodySchema = z.object({
  name: z.string().nonempty(),
  kitchenName: z.string().nullish(),
  priceCents: z.number().nonnegative(),
  customerDescription: z.string().nullish(),
  kitchenDescription: z.string().nullish(),
  unitId: z.nanoid(),
  categoryId: z.nanoid().nullish(),
  productType: z.enum(PRODUCT_TYPES),
});

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = z.object({});

export type CreateResponse = z.infer<typeof createResponseSchema>;
