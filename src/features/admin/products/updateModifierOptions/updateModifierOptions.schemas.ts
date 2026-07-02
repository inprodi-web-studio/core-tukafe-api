import { z } from "zod";
import { productResponseSchema } from "../product.schemas";

export const paramsSchema = z.object({
  productId: z.nanoid(),
  modifierId: z.nanoid(),
});

export const updateModifierOptionsBodySchema = z
  .object({
    optionIds: z.array(z.nanoid()).min(1).nullable(),
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
export type UpdateModifierOptionsBody = z.infer<typeof updateModifierOptionsBodySchema>;

export const updateModifierOptionsResponseSchema = productResponseSchema;

export type UpdateModifierOptionsResponse = z.infer<typeof updateModifierOptionsResponseSchema>;
