import { createPaginatedResponseSchema, listQueryParamsSchema } from "@core/utils";
import { z } from "zod";

export const couponDiscountTypeSchema = z.enum(["percentage", "fixed_amount"]);
export const couponPeriodLimitTypeSchema = z.enum(["day", "week", "month"]);

export const couponRulesSchema = z
  .object({
    includeProductIds: z.array(z.nanoid()).optional(),
    excludeProductIds: z.array(z.nanoid()).optional(),
    includeCategoryIds: z.array(z.nanoid()).optional(),
    excludeCategoryIds: z.array(z.nanoid()).optional(),
  })
  .strict();

export const couponResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  code: z.string(),
  normalizedCode: z.string(),
  isActive: z.boolean(),
  startsAt: z.date(),
  endsAt: z.date().nullable(),
  discountType: couponDiscountTypeSchema,
  discountValue: z.number().int().positive(),
  allowWithLoyaltyFreeDrink: z.boolean(),
  periodLimitType: couponPeriodLimitTypeSchema.nullable(),
  periodLimitCount: z.number().int().positive().nullable(),
  maxRedemptionsPerCustomer: z.number().int().positive(),
  minEligibleSubtotalCents: z.number().int().nonnegative().nullable(),
  maxDiscountCents: z.number().int().nonnegative().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  rules: z.object({
    includeProductIds: z.array(z.string()),
    excludeProductIds: z.array(z.string()),
    includeCategoryIds: z.array(z.string()),
    excludeCategoryIds: z.array(z.string()),
  }),
});

export const couponListItemSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  code: z.string(),
  isActive: z.boolean(),
  startsAt: z.date(),
  endsAt: z.date().nullable(),
  discountType: couponDiscountTypeSchema,
  discountValue: z.number().int().positive(),
  periodLimitType: couponPeriodLimitTypeSchema.nullable(),
  periodLimitCount: z.number().int().positive().nullable(),
  maxRedemptionsPerCustomer: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const listQuerySchema = listQueryParamsSchema;
export const listResponseSchema = createPaginatedResponseSchema(couponListItemSchema);
