import type {
  Customer,
  Order,
  OrderItem,
  OrderItemCompoundComponent,
  OrderItemModifier,
  OrderItemTax,
  OrderPaymentAttempt,
} from "@core/db/schemas";

export type OrderTipType = "none" | "percentage" | "amount";
export type OrderSource = "inplace" | "mobile" | "admin" | "unknown";
export type OrderPaymentProvider = "zettle" | "stripe";
export type OrderPaymentAttemptStatus =
  | "pending"
  | "paid_unlinked"
  | "completed"
  | "cancelled"
  | "failed"
  | "requires_reconciliation";

export type CreateOrderTipParams =
  | {
      type: "none";
    }
  | {
      type: "percentage";
      rateBps: number;
    }
  | {
      type: "amount";
      amountCents: number;
    };

export interface NormalizedCreateOrderTipParams {
  type: OrderTipType;
  rateBps: number | null;
  amountCents: number | null;
}

export interface CreateOrderParams {
  organizationId: string;
  customerId?: string | null;
  customerName?: string | null;
  paymentAttemptId?: string | null;
  couponCode?: string | null;
  cashbackRedeemCents?: number | null;
  preparationDelayMinutes?: 0 | 15 | 30 | null;
  comment?: string | null;
  tip?: CreateOrderTipParams | null;
  items: CreateOrderItemParams[];
}

export interface CreateOrderPaymentAttemptParams extends CreateOrderParams {
  amountCents: number;
  currency?: string | null;
}

export interface RecordOrderPaymentAttemptResultParams {
  paymentAttemptId: string;
  status: "paid" | "cancelled" | "failed";
  transactionId?: string | null;
  referenceNumber?: string | null;
  cardBrand?: string | null;
  entryMode?: string | null;
  authorizationCode?: string | null;
  obfuscatedPan?: string | null;
  amountCents?: number | null;
  rawResponse?: Record<string, unknown> | null;
  failureCode?: string | null;
  failureMessage?: string | null;
}

export interface CreateOrderItemParams {
  productId: string;
  variationId?: string | null;
  quantity: number;
  comment?: string | null;
  modifiers?: CreateOrderItemModifierParams[] | null;
  components?: CreateOrderItemCompoundComponentParams[] | null;
  clientItemId?: string | null;
  redeemFreeUnits?: number | null;
}

export interface CreateOrderItemCompoundComponentParams {
  componentId?: string | null;
  slotId?: string | null;
  slotOptionId?: string | null;
  productId: string;
  variationId?: string | null;
  modifiers?: CreateOrderItemModifierParams[] | null;
}

export interface CreateOrderItemModifierParams {
  modifierOptionId: string;
  quantity?: number | null;
}

export interface NormalizedCreateOrderItemModifierParams {
  modifierOptionId: string;
  quantity: number;
}

export interface NormalizedCreateOrderItemParams extends Omit<
  CreateOrderItemParams,
  "variationId" | "comment" | "modifiers" | "components" | "clientItemId" | "redeemFreeUnits"
> {
  variationId: string | null;
  comment: string | null;
  modifiers: NormalizedCreateOrderItemModifierParams[];
  components: NormalizedCreateOrderItemCompoundComponentParams[];
  clientItemId: string | null;
  redeemFreeUnits: number;
}

export interface NormalizedCreateOrderItemCompoundComponentParams extends Omit<
  CreateOrderItemCompoundComponentParams,
  "variationId" | "modifiers"
> {
  variationId: string | null;
  modifiers: NormalizedCreateOrderItemModifierParams[];
}

export type OrderItemLineType = "paid" | "free";

export interface NormalizedCreateOrderParams extends Omit<
  CreateOrderParams,
  "comment" | "customerName" | "items" | "tip"
> {
  customerId: string | null;
  customerName: string | null;
  couponCode: string | null;
  cashbackRedeemCents: number;
  preparationDelayMinutes: 0 | 15 | 30;
  comment: string | null;
  tip: NormalizedCreateOrderTipParams;
  items: NormalizedCreateOrderItemParams[];
}

export interface OrderCustomerResponse {
  id: string;
  userId: string | null;
  name: string | null;
  middleName: string | null;
  lastName: string | null;
  email: string | null;
  phoneNumber: string | null;
}

export type OrderItemModifierResponse = Omit<OrderItemModifier, "orderItemId">;

export type OrderItemTaxResponse = Omit<OrderItemTax, "orderItemId">;

export interface OrderItemCompoundComponentResponse extends Omit<
  OrderItemCompoundComponent,
  "orderItemId" | "createdAt" | "updatedAt"
> {
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface OrderItemResponse extends Omit<OrderItem, "orderId"> {
  sourceClientItemId: string | null;
  lineType: OrderItemLineType;
  displayUnitPriceCents: number;
  compoundComponents: OrderItemCompoundComponentResponse[];
  modifiers: OrderItemModifierResponse[];
  taxes: OrderItemTaxResponse[];
}

export interface OrderCouponAppliedItemResponse {
  orderItemId: string;
  productId: string;
  discountCents: number;
}

export interface OrderCouponResponse {
  code: string;
  discountCents: number;
  eligibleSubtotalCents: number;
  appliedItems: OrderCouponAppliedItemResponse[];
}

export interface OrderPromotionProgressResponse {
  progressCount: number;
  candidateProductIds: string[];
  eligibleForFreeDrink: boolean;
  legacyFreeDrinkPending: boolean;
  rewardMode: "legacy" | "standard" | null;
}

export interface OrderPromotionAppliedItemResponse {
  orderItemId: string;
  productId: string;
  freeUnits: number;
  promotionDiscountCents: number;
}

export interface OrderPromotionResponse {
  code: string;
  discountCents: number;
  progress: OrderPromotionProgressResponse;
  appliedItems: OrderPromotionAppliedItemResponse[];
}

export interface OrderResponse extends Order {
  customerId: string | null;
  tipType: OrderTipType;
  tipRateBps: number | null;
  tipCents: number;
  customer: OrderCustomerResponse | null;
  items: OrderItemResponse[];
  promotion: OrderPromotionResponse | null;
  coupon: OrderCouponResponse | null;
  payment: OrderPaymentAttemptResponse | null;
}

export interface OrderPaymentAttemptResponse extends OrderPaymentAttempt {
  provider: OrderPaymentProvider;
  status: OrderPaymentAttemptStatus;
}

export interface OrderPreviewResponse {
  tipType: OrderTipType;
  tipRateBps: number | null;
  tipCents: number;
  subtotalCents: number;
  taxesCents: number;
  grandTotalCents: number;
  amountDueCents: number;
  promotionDiscountCents: number;
  couponDiscountCents: number;
  cashbackBalanceCents: number | null;
  cashbackRedemptionCents: number;
  cashbackEarnedCents: number;
  cashbackEligiblePaidCents: number;
  items: OrderPreviewItemResponse[];
  promotion: OrderPromotionResponse | null;
  coupon: OrderCouponResponse | null;
}

export interface OrderPreviewItemResponse {
  id: string;
  productId: string;
  variationId: string | null;
  unitId: string;
  productName: string;
  variationName: string | null;
  unitName: string;
  unitAbbreviation: string;
  unitPrecision: number;
  quantity: number;
  comment: string | null;
  unitPriceCents: number;
  displayUnitPriceCents: number;
  modifiersSubtotalCents: number;
  freeUnits: number;
  promotionCode: string | null;
  promotionDiscountCents: number;
  couponDiscountCents: number;
  subtotalCents: number;
  taxesCents: number;
  grandTotalCents: number;
  sortOrder: number;
  sourceClientItemId: string | null;
  lineType: OrderItemLineType;
  modifiers: OrderItemModifierResponse[];
  taxes: OrderItemTaxResponse[];
}

export interface OrderWithRelations extends Order {
  customer: Pick<
    Customer,
    "id" | "userId" | "name" | "middleName" | "lastName" | "email" | "phone"
  > | null;
  items: Array<
    OrderItem & {
      compoundComponents: OrderItemCompoundComponent[];
      modifiers: OrderItemModifier[];
      taxes: OrderItemTax[];
    }
  >;
  paymentAttempts?: OrderPaymentAttempt[];
}

export interface OrderPromotionState {
  progressCount: number;
  candidateProductIds: string[];
  legacyFreeDrinkGrantedAt?: Date | null;
  legacyFreeDrinkRedeemedAt?: Date | null;
}
