import { createPaginatedResponseSchema } from "@core/utils";
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
  maxRedemptionsPerCustomer: z.number().int().positive().nullable(),
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
  effectiveStatus: z.enum(["active", "scheduled", "expired", "inactive"]),
  allowWithLoyaltyFreeDrink: z.boolean(),
  periodLimitType: couponPeriodLimitTypeSchema.nullable(),
  periodLimitCount: z.number().int().positive().nullable(),
  maxRedemptionsPerCustomer: z.number().int().positive().nullable(),
  minEligibleSubtotalCents: z.number().int().nonnegative().nullable(),
  maxDiscountCents: z.number().int().nonnegative().nullable(),
  redemptionCount: z.number().int().nonnegative(),
  totalDiscountCents: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
    search: z.string().trim().max(100).optional().nullable(),
    status: z.enum(["active", "scheduled", "expired", "inactive"]).optional(),
    discountType: couponDiscountTypeSchema.optional(),
    sortBy: z
      .enum(["code", "startsAt", "endsAt", "redemptions", "discountAmount", "updatedAt"])
      .default("updatedAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();
export const listResponseSchema = createPaginatedResponseSchema(couponListItemSchema);
