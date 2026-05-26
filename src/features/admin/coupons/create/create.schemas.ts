import { z } from "zod";
import {
  couponDiscountTypeSchema,
  couponPeriodLimitTypeSchema,
  couponResponseSchema,
  couponRulesSchema,
} from "../coupons.schemas";

export const createBodySchema = z
  .object({
    organizationId: z.nanoid(),
    code: z.string().trim().min(1).max(64),
    isActive: z.boolean().optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }).nullish(),
    discountType: couponDiscountTypeSchema,
    discountValue: z.number().int().positive(),
    allowWithLoyaltyFreeDrink: z.boolean().optional(),
    periodLimitType: couponPeriodLimitTypeSchema.nullish(),
    periodLimitCount: z.number().int().positive().nullish(),
    maxRedemptionsPerCustomer: z.number().int().positive().nullish(),
    minEligibleSubtotalCents: z.number().int().nonnegative().nullish(),
    maxDiscountCents: z.number().int().nonnegative().nullish(),
    rules: couponRulesSchema.nullish(),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = couponResponseSchema;

export type CreateResponse = z.infer<typeof createResponseSchema>;
