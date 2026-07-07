import { MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { z } from "zod";

export const orderItemModifierResponseSchema = z.object({
  id: z.string(),
  modifierId: z.string(),
  modifierOptionId: z.string(),
  modifierName: z.string(),
  modifierOptionName: z.string(),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  totalPriceCents: z.number().int().nonnegative(),
  sortOrder: z.number().int().min(0),
});

export const orderItemTaxResponseSchema = z.object({
  taxId: z.string(),
  taxName: z.string(),
  taxRate: z.number().int().min(0).max(10000),
  taxAmountCents: z.number().int().nonnegative(),
});

export const orderItemCompoundComponentResponseSchema = z.object({
  id: z.string(),
  compoundProductId: z.string(),
  slotId: z.string().nullable(),
  slotOptionId: z.string().nullable(),
  slotLabel: z.string().nullable(),
  componentProductId: z.string(),
  variationId: z.string().nullable(),
  componentLabel: z.string().nullable(),
  productName: z.string(),
  productKitchenName: z.string().nullable(),
  variationName: z.string().nullable(),
  variationSelectionsSnapshot: z.array(
    z.object({
      groupId: z.string(),
      groupName: z.string(),
      groupCustomerLabel: z.string().nullable(),
      optionId: z.string(),
      optionName: z.string(),
      optionKitchenName: z.string().nullable(),
    }),
  ),
  modifiersSnapshot: z.array(
    z.object({
      modifierId: z.string(),
      modifierName: z.string(),
      modifierKitchenName: z.string().nullable(),
      modifierOptionId: z.string(),
      modifierOptionName: z.string(),
      modifierOptionKitchenName: z.string().nullable(),
      quantity: z.number().positive(),
      unitPriceCents: z.number().int().nonnegative(),
      totalPriceCents: z.number().int().nonnegative(),
    }),
  ),
  quantity: z.number().positive(),
  modifiersSubtotalCents: z.number().int().nonnegative(),
  sortOrder: z.number().int().min(0),
  createdAt: z.date().nullable(),
  updatedAt: z.date().nullable(),
});

export const orderItemResponseSchema = z.object({
  id: z.string(),
  productId: z.string(),
  variationId: z.string().nullable(),
  unitId: z.string(),
  productName: z.string(),
  variationName: z.string().nullable(),
  unitName: z.string(),
  unitAbbreviation: z.string(),
  unitPrecision: z.number().int().min(0).max(MAX_SUPPORTED_DECIMAL_PLACES),
  quantity: z.number().positive(),
  comment: z.string().nullable(),
  unitPriceCents: z.number().int().nonnegative(),
  displayUnitPriceCents: z.number().int().nonnegative(),
  modifiersSubtotalCents: z.number().int().nonnegative(),
  freeUnits: z.number().int().nonnegative(),
  promotionCode: z.string().nullable(),
  promotionDiscountCents: z.number().int().nonnegative(),
  couponDiscountCents: z.number().int().nonnegative(),
  subtotalCents: z.number().int().nonnegative(),
  taxesCents: z.number().int().nonnegative(),
  grandTotalCents: z.number().int().nonnegative(),
  sortOrder: z.number().int().min(0),
  sourceClientItemId: z.string().nullable(),
  lineType: z.enum(["paid", "free"]),
  compoundComponents: z.array(orderItemCompoundComponentResponseSchema),
  modifiers: z.array(orderItemModifierResponseSchema),
  taxes: z.array(orderItemTaxResponseSchema),
});

export const orderPromotionProgressSchema = z.object({
  progressCount: z.number().int().min(0).max(4),
  candidateProductIds: z.array(z.string()),
  eligibleForFreeDrink: z.boolean(),
  legacyFreeDrinkPending: z.boolean(),
  rewardMode: z.enum(["legacy", "standard"]).nullable(),
});

export const orderPromotionAppliedItemSchema = z.object({
  orderItemId: z.string(),
  productId: z.string(),
  freeUnits: z.number().int().nonnegative(),
  promotionDiscountCents: z.number().int().nonnegative(),
});

export const orderPromotionSchema = z.object({
  code: z.string(),
  discountCents: z.number().int().nonnegative(),
  progress: orderPromotionProgressSchema,
  appliedItems: z.array(orderPromotionAppliedItemSchema),
});

export const orderCouponAppliedItemSchema = z.object({
  orderItemId: z.string(),
  productId: z.string(),
  discountCents: z.number().int().nonnegative(),
});

export const orderCouponSchema = z.object({
  code: z.string(),
  discountCents: z.number().int().nonnegative(),
  eligibleSubtotalCents: z.number().int().nonnegative(),
  appliedItems: z.array(orderCouponAppliedItemSchema),
});

export const orderPaymentAttemptStatusSchema = z.enum([
  "pending",
  "paid_unlinked",
  "completed",
  "cancelled",
  "failed",
  "requires_reconciliation",
]);

export const orderPaymentAttemptResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  customerId: z.string().nullable(),
  orderId: z.string().nullable(),
  provider: z.enum(["zettle", "stripe"]),
  reference: z.string(),
  amountCents: z.number().int().positive(),
  currency: z.string(),
  status: orderPaymentAttemptStatusSchema,
  transactionId: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  cardBrand: z.string().nullable(),
  entryMode: z.string().nullable(),
  authorizationCode: z.string().nullable(),
  obfuscatedPan: z.string().nullable(),
  orderPayload: z.record(z.string(), z.unknown()).nullable(),
  rawResponse: z.record(z.string(), z.unknown()).nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const orderResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  customerId: z.string().nullable(),
  folio: z.string(),
  comment: z.string().nullable(),
  tipType: z.enum(["none", "percentage", "amount"]),
  tipRateBps: z.number().int().min(1).max(10000).nullable(),
  tipCents: z.number().int().nonnegative(),
  promotionDiscountCents: z.number().int().nonnegative(),
  couponDiscountCents: z.number().int().nonnegative(),
  cashbackRedemptionCents: z.number().int().nonnegative(),
  cashbackEarnedCents: z.number().int().nonnegative(),
  cashbackEligiblePaidCents: z.number().int().nonnegative(),
  subtotalCents: z.number().int().nonnegative(),
  taxesCents: z.number().int().nonnegative(),
  grandTotalCents: z.number().int().nonnegative(),
  amountDueCents: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
  customer: z
    .object({
      id: z.string(),
      userId: z.string().nullable(),
      name: z.string().nullable(),
      middleName: z.string().nullable(),
      lastName: z.string().nullable(),
      email: z.string().nullable(),
      phoneNumber: z.string().nullable(),
    })
    .nullable(),
  items: z.array(orderItemResponseSchema),
  promotion: orderPromotionSchema.nullable(),
  coupon: orderCouponSchema.nullable(),
  payment: orderPaymentAttemptResponseSchema.nullable(),
});

export const orderPreviewResponseSchema = z.object({
  tipType: z.enum(["none", "percentage", "amount"]),
  tipRateBps: z.number().int().min(1).max(10000).nullable(),
  tipCents: z.number().int().nonnegative(),
  promotionDiscountCents: z.number().int().nonnegative(),
  couponDiscountCents: z.number().int().nonnegative(),
  cashbackBalanceCents: z.number().int().nonnegative().nullable(),
  cashbackRedemptionCents: z.number().int().nonnegative(),
  cashbackEarnedCents: z.number().int().nonnegative(),
  cashbackEligiblePaidCents: z.number().int().nonnegative(),
  subtotalCents: z.number().int().nonnegative(),
  taxesCents: z.number().int().nonnegative(),
  grandTotalCents: z.number().int().nonnegative(),
  amountDueCents: z.number().int().nonnegative(),
  items: z.array(orderItemResponseSchema),
  promotion: orderPromotionSchema.nullable(),
  coupon: orderCouponSchema.nullable(),
});
