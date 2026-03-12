import { hasAtMostDecimalPlaces, MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { z } from "zod";
import { orderResponseSchema } from "../orders.schemas";

const quantitySchema = z
  .number()
  .positive()
  .refine(
    (value) => hasAtMostDecimalPlaces(value, MAX_SUPPORTED_DECIMAL_PLACES),
    `Quantity must have at most ${MAX_SUPPORTED_DECIMAL_PLACES} decimal places`,
  );

const modifierBodySchema = z
  .object({
    modifierOptionId: z.nanoid(),
    quantity: z.number().int().positive().optional(),
  })
  .strict();

const orderItemBodySchema = z
  .object({
    productId: z.nanoid(),
    variationId: z.nanoid().nullish(),
    quantity: quantitySchema,
    comment: z.string().nullish(),
    modifiers: z.array(modifierBodySchema).optional(),
  })
  .strict();

export const createBodySchema = z
  .object({
    customerId: z.string(),
    comment: z.string().nullish(),
    items: z.array(orderItemBodySchema).min(1),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = orderResponseSchema;

export type CreateResponse = z.infer<typeof createResponseSchema>;
