import { hasAtMostDecimalPlaces, MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { z } from "zod";

export const orderItemQuantitySchema = z
  .number()
  .positive()
  .refine(
    (value) => hasAtMostDecimalPlaces(value, MAX_SUPPORTED_DECIMAL_PLACES),
    `Quantity must have at most ${MAX_SUPPORTED_DECIMAL_PLACES} decimal places`,
  );

export const orderModifierBodySchema = z
  .object({
    modifierOptionId: z.nanoid(),
    quantity: z.number().int().positive().optional(),
  })
  .strict();

export const orderItemBodySchema = z
  .object({
    productId: z.nanoid(),
    variationId: z.nanoid().nullish(),
    quantity: orderItemQuantitySchema,
    comment: z.string().nullish(),
    modifiers: z.array(orderModifierBodySchema).optional(),
  })
  .strict();
