import type {
  Coupon,
  CouponCategoryRule,
  CouponPeriodLimitType,
  CouponProductRule,
} from "@core/db/schemas";
import { validation } from "@core/utils";
import type { PreparedOrderPayload } from "./orders.validators";
import type { OrderCouponResponse, OrderPromotionResponse } from "./orders.types";

export const COUPON_TIMEZONE = "America/Mexico_City";

export interface CouponWithRules extends Coupon {
  productRules: CouponProductRule[];
  categoryRules: CouponCategoryRule[];
}

export interface EvaluatedCouponResult {
  payload: PreparedOrderPayload;
  coupon: OrderCouponResponse;
}

function normalizeAndUniqueIds(values: string[]): string[] {
  const seen = new Set<string>();
  const normalizedValues: string[] = [];

  for (const value of values) {
    const normalizedValue = value.trim();

    if (normalizedValue.length === 0 || seen.has(normalizedValue)) {
      continue;
    }

    seen.add(normalizedValue);
    normalizedValues.push(normalizedValue);
  }

  return normalizedValues;
}

function isCouponStarted(coupon: CouponWithRules, now: Date): boolean {
  return coupon.startsAt.getTime() <= now.getTime();
}

function isCouponExpired(coupon: CouponWithRules, now: Date): boolean {
  return Boolean(coupon.endsAt && coupon.endsAt.getTime() < now.getTime());
}

export function validateCouponWindow(coupon: CouponWithRules, now: Date): void {
  if (!coupon.isActive) {
    throw validation("coupon.inactive", "The coupon is inactive");
  }

  if (!isCouponStarted(coupon, now)) {
    throw validation("coupon.notStarted", "The coupon is not active yet");
  }

  if (isCouponExpired(coupon, now)) {
    throw validation("coupon.expired", "The coupon has expired");
  }
}

export function validateCouponPromotionCompatibility({
  coupon,
  promotion,
}: {
  coupon: CouponWithRules;
  promotion: OrderPromotionResponse | null;
}) {
  if (coupon.allowWithLoyaltyFreeDrink) {
    return;
  }

  const appliedFreeUnits =
    promotion?.appliedItems.reduce((total, item) => total + Math.max(0, item.freeUnits), 0) ?? 0;

  if (appliedFreeUnits > 0) {
    throw validation(
      "coupon.promotionCompatibility.notAllowed",
      "This coupon cannot be combined with free drink redemptions",
    );
  }
}

function getCouponRuleSets(coupon: CouponWithRules): {
  includeProductIds: Set<string>;
  excludeProductIds: Set<string>;
  includeCategoryIds: Set<string>;
  excludeCategoryIds: Set<string>;
} {
  const includeProductIds = normalizeAndUniqueIds(
    coupon.productRules.filter((rule) => rule.mode === "include").map((rule) => rule.productId),
  );
  const excludeProductIds = normalizeAndUniqueIds(
    coupon.productRules.filter((rule) => rule.mode === "exclude").map((rule) => rule.productId),
  );
  const includeCategoryIds = normalizeAndUniqueIds(
    coupon.categoryRules
      .filter((rule) => rule.mode === "include")
      .map((rule) => rule.categoryId),
  );
  const excludeCategoryIds = normalizeAndUniqueIds(
    coupon.categoryRules
      .filter((rule) => rule.mode === "exclude")
      .map((rule) => rule.categoryId),
  );

  return {
    includeProductIds: new Set(includeProductIds),
    excludeProductIds: new Set(excludeProductIds),
    includeCategoryIds: new Set(includeCategoryIds),
    excludeCategoryIds: new Set(excludeCategoryIds),
  };
}

function distributeIntegerDiscountBySubtotal({
  totalDiscount,
  subtotals,
}: {
  totalDiscount: number;
  subtotals: number[];
}): number[] {
  if (totalDiscount <= 0 || subtotals.length === 0) {
    return subtotals.map(() => 0);
  }

  const subtotalSum = subtotals.reduce((acc, value) => acc + value, 0);
  if (subtotalSum <= 0) {
    return subtotals.map(() => 0);
  }

  const rawShares = subtotals.map((subtotal) => (totalDiscount * subtotal) / subtotalSum);
  const baseShares = rawShares.map((value) => Math.floor(value));
  let remaining = totalDiscount - baseShares.reduce((acc, value) => acc + value, 0);

  const sortedByRemainder = rawShares
    .map((value, index) => ({
      index,
      remainder: value - Math.floor(value),
    }))
    .sort((left, right) => {
      if (right.remainder !== left.remainder) {
        return right.remainder - left.remainder;
      }

      return left.index - right.index;
    });

  for (const candidate of sortedByRemainder) {
    if (remaining <= 0) {
      break;
    }

    const currentShare = baseShares[candidate.index] ?? 0;
    baseShares[candidate.index] = currentShare + 1;
    remaining -= 1;
  }

  return baseShares;
}

export function applyCouponToPreparedOrder({
  preparedPayload,
  coupon,
}: {
  preparedPayload: PreparedOrderPayload;
  coupon: CouponWithRules;
}): EvaluatedCouponResult {
  const ruleSets = getCouponRuleSets(coupon);
  const hasIncludeRules =
    ruleSets.includeProductIds.size > 0 || ruleSets.includeCategoryIds.size > 0;

  const eligibleItems = preparedPayload.items.filter((preparedOrderItem) => {
    const productId = preparedOrderItem.item.productId;
    const categoryId = preparedOrderItem.productCategoryId;

    const isIncluded =
      !hasIncludeRules ||
      ruleSets.includeProductIds.has(productId) ||
      (categoryId ? ruleSets.includeCategoryIds.has(categoryId) : false);

    const isExcluded =
      ruleSets.excludeProductIds.has(productId) ||
      (categoryId ? ruleSets.excludeCategoryIds.has(categoryId) : false);

    if (!isIncluded || isExcluded) {
      return false;
    }

    return preparedOrderItem.item.subtotalCents > 0;
  });

  if (eligibleItems.length === 0) {
    throw validation("coupon.eligibility.noEligibleItems", "Coupon does not apply to order items");
  }

  const eligibleSubtotalCents = eligibleItems.reduce(
    (total, preparedOrderItem) => total + preparedOrderItem.item.subtotalCents,
    0,
  );

  if (
    coupon.minEligibleSubtotalCents !== null &&
    eligibleSubtotalCents < coupon.minEligibleSubtotalCents
  ) {
    throw validation(
      "coupon.eligibility.minSubtotalNotReached",
      "Order does not meet coupon minimum subtotal",
    );
  }

  const requestedSubtotalDiscountCents =
    coupon.discountType === "percentage"
      ? Math.round((eligibleSubtotalCents * coupon.discountValue) / 10000)
      : coupon.discountValue;

  const constrainedSubtotalDiscountCents = Math.max(
    0,
    Math.min(
      requestedSubtotalDiscountCents,
      coupon.maxDiscountCents ?? Number.POSITIVE_INFINITY,
      eligibleSubtotalCents,
    ),
  );

  if (constrainedSubtotalDiscountCents <= 0) {
    throw validation("coupon.discount.zero", "Coupon discount resulted in zero amount");
  }

  const discountsByEligibleItem = distributeIntegerDiscountBySubtotal({
    totalDiscount: constrainedSubtotalDiscountCents,
    subtotals: eligibleItems.map((item) => item.item.subtotalCents),
  });

  const discountByOrderItemId = new Map<string, number>();
  for (const [index, eligibleItem] of eligibleItems.entries()) {
    const allocatedDiscount = discountsByEligibleItem[index] ?? 0;
    discountByOrderItemId.set(eligibleItem.item.id, allocatedDiscount);
  }

  let totalDiscountCents = 0;
  const appliedItems: OrderCouponResponse["appliedItems"] = [];

  for (const preparedOrderItem of preparedPayload.items) {
    const subtotalDiscountCents = discountByOrderItemId.get(preparedOrderItem.item.id) ?? 0;

    if (subtotalDiscountCents <= 0) {
      preparedOrderItem.item.couponDiscountCents = 0;
      continue;
    }

    const originalSubtotalCents = preparedOrderItem.item.subtotalCents;
    const originalTaxesCents = preparedOrderItem.item.taxesCents;

    const safeSubtotalDiscountCents = Math.max(0, Math.min(subtotalDiscountCents, originalSubtotalCents));
    const taxDiscountCents =
      originalSubtotalCents > 0
        ? Math.max(
            0,
            Math.min(
              originalTaxesCents,
              Math.round((originalTaxesCents * safeSubtotalDiscountCents) / originalSubtotalCents),
            ),
          )
        : 0;

    const itemDiscountCents = safeSubtotalDiscountCents + taxDiscountCents;

    preparedOrderItem.item.subtotalCents = Math.max(
      0,
      originalSubtotalCents - safeSubtotalDiscountCents,
    );
    preparedOrderItem.item.taxesCents = Math.max(0, originalTaxesCents - taxDiscountCents);
    preparedOrderItem.item.grandTotalCents =
      preparedOrderItem.item.subtotalCents + preparedOrderItem.item.taxesCents;
    preparedOrderItem.item.couponDiscountCents = itemDiscountCents;

    totalDiscountCents += itemDiscountCents;
    appliedItems.push({
      orderItemId: preparedOrderItem.item.id,
      productId: preparedOrderItem.item.productId,
      discountCents: itemDiscountCents,
    });
  }

  const subtotalCents = preparedPayload.items.reduce(
    (total, preparedOrderItem) => total + preparedOrderItem.item.subtotalCents,
    0,
  );
  const taxesCents = preparedPayload.items.reduce(
    (total, preparedOrderItem) => total + preparedOrderItem.item.taxesCents,
    0,
  );

  return {
    payload: {
      ...preparedPayload,
      subtotalCents,
      taxesCents,
      grandTotalCents: subtotalCents + taxesCents,
    },
    coupon: {
      code: coupon.code,
      discountCents: totalDiscountCents,
      eligibleSubtotalCents,
      appliedItems,
    },
  };
}

function getDatePartsInTimezone(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");

  return { year, month, day };
}

function formatDateOnlyFromUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function resolveCouponPeriodStartDate({
  periodType,
  now,
  timezone = COUPON_TIMEZONE,
}: {
  periodType: CouponPeriodLimitType;
  now: Date;
  timezone?: string;
}): string {
  const parts = getDatePartsInTimezone(now, timezone);
  const currentUtcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  if (periodType === "day") {
    return formatDateOnlyFromUtcDate(currentUtcDate);
  }

  if (periodType === "month") {
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-01`;
  }

  const weekDay = currentUtcDate.getUTCDay();
  const daysToMonday = (weekDay + 6) % 7;
  const mondayDate = new Date(currentUtcDate);
  mondayDate.setUTCDate(currentUtcDate.getUTCDate() - daysToMonday);

  return formatDateOnlyFromUtcDate(mondayDate);
}
