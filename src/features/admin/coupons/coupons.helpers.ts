import {
  COUPON_DISCOUNT_TYPES,
  COUPON_PERIOD_LIMIT_TYPES,
  type CouponCategoryRule,
  type CouponDiscountType,
  type CouponPeriodLimitType,
  type CouponProductRule,
} from "@core/db/schemas";
import { normalizeString, validation } from "@core/utils";
import type {
  CouponRuleSetInput,
  CouponRuleSetResponse,
  CreateCouponServiceParams,
  UpdateCouponServiceParams,
} from "./coupons.types";

export const COUPON_CODE_MAX_LENGTH = 64;

function normalizeIdArray(values?: string[] | null): string[] {
  const uniqueValues = new Set<string>();
  const normalizedValues: string[] = [];

  for (const value of values ?? []) {
    const normalizedValue = normalizeString(value, {
      trim: true,
      collapseWhitespace: true,
      maxLength: 120,
    });

    if (normalizedValue.length === 0 || uniqueValues.has(normalizedValue)) {
      continue;
    }

    uniqueValues.add(normalizedValue);
    normalizedValues.push(normalizedValue);
  }

  return normalizedValues;
}

export function normalizeCouponCode(value: string): string {
  return normalizeString(value, {
    trim: true,
    uppercase: true,
    collapseWhitespace: true,
    removeWhitespace: true,
    maxLength: COUPON_CODE_MAX_LENGTH,
  });
}

function validatePeriodLimitPair(
  periodLimitType: CouponPeriodLimitType | null,
  periodLimitCount: number | null,
) {
  const hasPeriodType = periodLimitType !== null;
  const hasPeriodCount = periodLimitCount !== null;

  if (hasPeriodType !== hasPeriodCount) {
    throw validation(
      "coupon.periodLimit.invalidConfiguration",
      "periodLimitType and periodLimitCount must be provided together",
    );
  }
}

function assertValidDiscountType(value: string): asserts value is CouponDiscountType {
  if (!COUPON_DISCOUNT_TYPES.includes(value as CouponDiscountType)) {
    throw validation("coupon.discountType.invalid", "Invalid coupon discount type");
  }
}

function assertValidPeriodType(value: string): asserts value is CouponPeriodLimitType {
  if (!COUPON_PERIOD_LIMIT_TYPES.includes(value as CouponPeriodLimitType)) {
    throw validation("coupon.periodLimitType.invalid", "Invalid coupon period limit type");
  }
}

export function normalizeCouponRules(input?: CouponRuleSetInput | null): CouponRuleSetResponse {
  const rules = {
    includeProductIds: normalizeIdArray(input?.includeProductIds),
    excludeProductIds: normalizeIdArray(input?.excludeProductIds),
    includeCategoryIds: normalizeIdArray(input?.includeCategoryIds),
    excludeCategoryIds: normalizeIdArray(input?.excludeCategoryIds),
  };

  if (rules.includeProductIds.some((id) => rules.excludeProductIds.includes(id))) {
    throw validation(
      "coupon.rules.productOverlap",
      "A product cannot be included and excluded at the same time",
    );
  }
  if (rules.includeCategoryIds.some((id) => rules.excludeCategoryIds.includes(id))) {
    throw validation(
      "coupon.rules.categoryOverlap",
      "A category cannot be included and excluded at the same time",
    );
  }

  return rules;
}

export function normalizeCreateCouponInput(input: CreateCouponServiceParams) {
  const code = normalizeString(input.code, {
    trim: true,
    collapseWhitespace: true,
    maxLength: COUPON_CODE_MAX_LENGTH,
  });

  if (code.length === 0) {
    throw validation("coupon.code.required", "Coupon code is required");
  }

  const normalizedCode = normalizeCouponCode(code);

  if (normalizedCode.length === 0) {
    throw validation("coupon.code.invalid", "Coupon code is invalid");
  }

  assertValidDiscountType(input.discountType);

  if (input.periodLimitType !== null && input.periodLimitType !== undefined) {
    assertValidPeriodType(input.periodLimitType);
  }

  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    throw validation("coupon.startsAt.invalid", "Invalid startsAt value");
  }

  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (input.endsAt && Number.isNaN(endsAt?.getTime() ?? NaN)) {
    throw validation("coupon.endsAt.invalid", "Invalid endsAt value");
  }

  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw validation("coupon.validityRange.invalid", "endsAt cannot be before startsAt");
  }

  const discountValue = Math.trunc(input.discountValue);
  if (discountValue <= 0) {
    throw validation("coupon.discountValue.invalid", "discountValue must be greater than 0");
  }

  if (input.discountType === "percentage" && discountValue > 10000) {
    throw validation(
      "coupon.discountValue.invalidPercentage",
      "Percentage discountValue must be between 1 and 10000",
    );
  }

  const periodLimitType = input.periodLimitType ?? null;
  const periodLimitCount =
    input.periodLimitCount === null || input.periodLimitCount === undefined
      ? null
      : Math.trunc(input.periodLimitCount);

  if (periodLimitCount !== null && periodLimitCount <= 0) {
    throw validation("coupon.periodLimitCount.invalid", "periodLimitCount must be greater than 0");
  }

  validatePeriodLimitPair(periodLimitType, periodLimitCount);

  const maxRedemptionsPerCustomer =
    input.maxRedemptionsPerCustomer === undefined
      ? 1
      : input.maxRedemptionsPerCustomer === null
        ? null
        : Math.trunc(input.maxRedemptionsPerCustomer);
  if (maxRedemptionsPerCustomer !== null && maxRedemptionsPerCustomer <= 0) {
    throw validation(
      "coupon.maxRedemptionsPerCustomer.invalid",
      "maxRedemptionsPerCustomer must be greater than 0",
    );
  }

  const minEligibleSubtotalCents =
    input.minEligibleSubtotalCents === null || input.minEligibleSubtotalCents === undefined
      ? null
      : Math.trunc(input.minEligibleSubtotalCents);
  if (minEligibleSubtotalCents !== null && minEligibleSubtotalCents < 0) {
    throw validation(
      "coupon.minEligibleSubtotalCents.invalid",
      "minEligibleSubtotalCents cannot be negative",
    );
  }

  const maxDiscountCents =
    input.maxDiscountCents === null || input.maxDiscountCents === undefined
      ? null
      : Math.trunc(input.maxDiscountCents);
  if (maxDiscountCents !== null && maxDiscountCents < 0) {
    throw validation("coupon.maxDiscountCents.invalid", "maxDiscountCents cannot be negative");
  }

  return {
    organizationIds: [...new Set(input.organizationIds)],
    code,
    normalizedCode,
    isActive: input.isActive ?? true,
    startsAt,
    endsAt,
    discountType: input.discountType,
    discountValue,
    allowWithLoyaltyFreeDrink: input.allowWithLoyaltyFreeDrink ?? false,
    periodLimitType,
    periodLimitCount,
    maxRedemptionsPerCustomer,
    minEligibleSubtotalCents,
    maxDiscountCents,
    rules: normalizeCouponRules(input.rules),
  };
}

export function normalizeUpdateCouponInput(input: UpdateCouponServiceParams): {
  updates: {
    code?: string;
    normalizedCode?: string;
    isActive?: boolean;
    startsAt?: Date;
    endsAt?: Date | null;
    discountType?: CouponDiscountType;
    discountValue?: number;
    allowWithLoyaltyFreeDrink?: boolean;
    periodLimitType?: CouponPeriodLimitType | null;
    periodLimitCount?: number | null;
    maxRedemptionsPerCustomer?: number | null;
    minEligibleSubtotalCents?: number | null;
    maxDiscountCents?: number | null;
  };
  rules: CouponRuleSetResponse | null;
} {
  const updates: {
    code?: string;
    normalizedCode?: string;
    isActive?: boolean;
    startsAt?: Date;
    endsAt?: Date | null;
    discountType?: CouponDiscountType;
    discountValue?: number;
    allowWithLoyaltyFreeDrink?: boolean;
    periodLimitType?: CouponPeriodLimitType | null;
    periodLimitCount?: number | null;
    maxRedemptionsPerCustomer?: number | null;
    minEligibleSubtotalCents?: number | null;
    maxDiscountCents?: number | null;
  } = {};

  if (input.code !== undefined) {
    const code = normalizeString(input.code, {
      trim: true,
      collapseWhitespace: true,
      maxLength: COUPON_CODE_MAX_LENGTH,
    });
    if (code.length === 0) {
      throw validation("coupon.code.required", "Coupon code is required");
    }

    const normalizedCode = normalizeCouponCode(code);
    if (normalizedCode.length === 0) {
      throw validation("coupon.code.invalid", "Coupon code is invalid");
    }

    updates.code = code;
    updates.normalizedCode = normalizedCode;
  }

  if (input.isActive !== undefined && input.isActive !== null) {
    updates.isActive = input.isActive;
  }

  if (input.startsAt !== undefined && input.startsAt !== null) {
    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw validation("coupon.startsAt.invalid", "Invalid startsAt value");
    }
    updates.startsAt = startsAt;
  }

  if (input.endsAt !== undefined) {
    if (input.endsAt === null) {
      updates.endsAt = null;
    } else {
      const endsAt = new Date(input.endsAt);
      if (Number.isNaN(endsAt.getTime())) {
        throw validation("coupon.endsAt.invalid", "Invalid endsAt value");
      }
      updates.endsAt = endsAt;
    }
  }

  if (input.discountType !== undefined && input.discountType !== null) {
    assertValidDiscountType(input.discountType);
    updates.discountType = input.discountType;
  }

  if (input.discountValue !== undefined && input.discountValue !== null) {
    const discountValue = Math.trunc(input.discountValue);
    if (discountValue <= 0) {
      throw validation("coupon.discountValue.invalid", "discountValue must be greater than 0");
    }
    updates.discountValue = discountValue;
  }

  if (input.allowWithLoyaltyFreeDrink !== undefined && input.allowWithLoyaltyFreeDrink !== null) {
    updates.allowWithLoyaltyFreeDrink = input.allowWithLoyaltyFreeDrink;
  }

  if (input.periodLimitType !== undefined) {
    if (input.periodLimitType !== null) {
      assertValidPeriodType(input.periodLimitType);
    }
    updates.periodLimitType = input.periodLimitType;
  }

  if (input.periodLimitCount !== undefined) {
    if (input.periodLimitCount === null) {
      updates.periodLimitCount = null;
    } else {
      const periodLimitCount = Math.trunc(input.periodLimitCount);
      if (periodLimitCount <= 0) {
        throw validation(
          "coupon.periodLimitCount.invalid",
          "periodLimitCount must be greater than 0",
        );
      }
      updates.periodLimitCount = periodLimitCount;
    }
  }

  if (input.maxRedemptionsPerCustomer !== undefined) {
    if (input.maxRedemptionsPerCustomer === null) {
      updates.maxRedemptionsPerCustomer = null;
    } else {
      const maxRedemptionsPerCustomer = Math.trunc(input.maxRedemptionsPerCustomer);
      if (maxRedemptionsPerCustomer <= 0) {
        throw validation(
          "coupon.maxRedemptionsPerCustomer.invalid",
          "maxRedemptionsPerCustomer must be greater than 0",
        );
      }
      updates.maxRedemptionsPerCustomer = maxRedemptionsPerCustomer;
    }
  }

  if (input.minEligibleSubtotalCents !== undefined) {
    if (input.minEligibleSubtotalCents === null) {
      updates.minEligibleSubtotalCents = null;
    } else {
      const minEligibleSubtotalCents = Math.trunc(input.minEligibleSubtotalCents);
      if (minEligibleSubtotalCents < 0) {
        throw validation(
          "coupon.minEligibleSubtotalCents.invalid",
          "minEligibleSubtotalCents cannot be negative",
        );
      }
      updates.minEligibleSubtotalCents = minEligibleSubtotalCents;
    }
  }

  if (input.maxDiscountCents !== undefined) {
    if (input.maxDiscountCents === null) {
      updates.maxDiscountCents = null;
    } else {
      const maxDiscountCents = Math.trunc(input.maxDiscountCents);
      if (maxDiscountCents < 0) {
        throw validation("coupon.maxDiscountCents.invalid", "maxDiscountCents cannot be negative");
      }
      updates.maxDiscountCents = maxDiscountCents;
    }
  }

  if (updates.discountType === "percentage" && updates.discountValue !== undefined) {
    if (updates.discountValue > 10000) {
      throw validation(
        "coupon.discountValue.invalidPercentage",
        "Percentage discountValue must be between 1 and 10000",
      );
    }
  }

  const rules = input.rules === undefined ? null : normalizeCouponRules(input.rules);

  return {
    updates,
    rules,
  };
}

export function mapCouponRulesResponse({
  productRules,
  categoryRules,
}: {
  productRules: CouponProductRule[];
  categoryRules: CouponCategoryRule[];
}): CouponRuleSetResponse {
  return {
    includeProductIds: productRules
      .filter((rule) => rule.mode === "include")
      .map((rule) => rule.productId),
    excludeProductIds: productRules
      .filter((rule) => rule.mode === "exclude")
      .map((rule) => rule.productId),
    includeCategoryIds: categoryRules
      .filter((rule) => rule.mode === "include")
      .map((rule) => rule.categoryId),
    excludeCategoryIds: categoryRules
      .filter((rule) => rule.mode === "exclude")
      .map((rule) => rule.categoryId),
  };
}
