import { z } from "zod";

export const paramsSchema = z.object({
  productId: z.nanoid(),
});

export const querystringSchema = z.object({
  customerId: z.nanoid(),
});

export const customerOrderCountResponseSchema = z.object({
  productId: z.string(),
  customerId: z.string(),
  orderedUnitsCount: z.number().nonnegative(),
});

export type Params = z.infer<typeof paramsSchema>;
export type Querystring = z.infer<typeof querystringSchema>;
