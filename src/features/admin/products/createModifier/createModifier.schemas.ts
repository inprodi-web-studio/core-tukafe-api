import { z } from "zod";
import { productResponseSchema } from "../product.schemas";

export const paramsSchema = z.object({
  productId: z.nanoid(),
});

export const createModifierBodySchema = z
  .object({
    modifierId: z.nanoid(),
    optionIds: z.array(z.nanoid()).min(1).nullish(),
    visibleWhen: z
      .array(
        z
          .object({
            variationGroupId: z.nanoid(),
            variationOptionId: z.nanoid(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export type Params = z.infer<typeof paramsSchema>;
export type CreateModifierBody = z.infer<typeof createModifierBodySchema>;

export const createModifierResponseSchema = productResponseSchema;

export type CreateModifierResponse = z.infer<typeof createModifierResponseSchema>;
