import { PRODUCT_TYPES } from "@core/db/schemas";
import { z } from "zod";

export const createBodySchema = z.object({
  name: z.string().nonempty(),
  kitchenName: z.string().nullish(),
  price: z.number().nonnegative(),
  customerDescription: z.string().nullish(),
  kitchenDescription: z.string().nullish(),
  unitId: z.nanoid(),
  categoryId: z.nanoid().nullish(),
  productType: z.enum(PRODUCT_TYPES),
});

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  kitchenName: z.string().nullish(),
  priceCents: z.number().nonnegative(),
  customerDescription: z.string(),
  kitchenDescription: z.string().nullish(),
  unit: z.object({
    id: z.string(),
    name: z.string(),
    abbreviation: z.string(),
    precision: z.number().nonnegative(),
  }),
  category: z
    .object({
      id: z.string(),
      name: z.string(),
      icon: z.string(),
      color: z.string(),
      parentId: z.string().nullish(),
    })
    .nullish(),
  productType: z.string(),
});

export type CreateResponse = z.infer<typeof createResponseSchema>;
