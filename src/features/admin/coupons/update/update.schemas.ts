import { z } from "zod";
import {
  couponDiscountTypeSchema,
  couponPeriodLimitTypeSchema,
  couponResponseSchema,
  couponRulesSchema,
} from "../coupons.schemas";

export const paramsSchema = z
  .object({
    couponId: z.nanoid(),
  })
  .strict();

export type Params = z.infer<typeof paramsSchema>;

export const updateBodySchema = z
  .object({
    code: z.string().trim().min(1).max(64).nullish(),
    startsAt: z.string().datetime({ offset: true }).nullish(),
    endsAt: z.string().datetime({ offset: true }).nullish(),
    discountType: couponDiscountTypeSchema.nullish(),
    discountValue: z.number().int().positive().nullish(),
    allowWithLoyaltyFreeDrink: z.boolean().nullish(),
    periodLimitType: couponPeriodLimitTypeSchema.nullish(),
    periodLimitCount: z.number().int().positive().nullish(),
    maxRedemptionsPerCustomer: z.number().int().positive().nullish(),
    minEligibleSubtotalCents: z.number().int().nonnegative().nullish(),
    maxDiscountCents: z.number().int().nonnegative().nullish(),
    rules: couponRulesSchema.nullish(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateBody = z.infer<typeof updateBodySchema>;

export const updateResponseSchema = couponResponseSchema;
export type UpdateResponse = z.infer<typeof updateResponseSchema>;
