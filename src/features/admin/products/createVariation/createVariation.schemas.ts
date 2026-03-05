import { z } from "zod";
import { productResponseSchema, variationSchema } from "../product.schemas";

export const paramsSchema = z.object({
  productId: z.nanoid(),
});

export const createVariationBodySchema = variationSchema;

export type Params = z.infer<typeof paramsSchema>;
export type CreateVariationBody = z.infer<typeof createVariationBodySchema>;

export const createVariationResponseSchema = productResponseSchema;

export type CreateVariationResponse = z.infer<typeof createVariationResponseSchema>;
