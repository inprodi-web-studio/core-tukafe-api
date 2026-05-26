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
    clientItemId: z.string().trim().min(1).max(120).nullish(),
    redeemFreeUnits: z.number().int().nonnegative().nullish(),
  })
  .strict();

export const orderCouponCodeSchema = z.string().trim().min(1).max(64);
export const orderPaymentAttemptIdSchema = z.nanoid();

export const orderTipBodySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("none"),
    })
    .strict(),
  z
    .object({
      type: z.literal("percentage"),
      rateBps: z.number().int().min(1).max(10000),
    })
    .strict(),
  z
    .object({
      type: z.literal("amount"),
      amountCents: z.number().int().nonnegative(),
    })
    .strict(),
]);
