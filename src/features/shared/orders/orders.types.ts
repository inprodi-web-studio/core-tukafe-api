import type {
  Customer,
  Order,
  OrderItem,
  OrderItemModifier,
  OrderItemTax,
  OrderPaymentAttempt,
} from "@core/db/schemas";

export type OrderTipType = "none" | "percentage" | "amount";
export type OrderPaymentProvider = "zettle";
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
  paymentAttemptId?: string | null;
  couponCode?: string | null;
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
  clientItemId?: string | null;
  redeemFreeUnits?: number | null;
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
  "variationId" | "comment" | "modifiers" | "clientItemId" | "redeemFreeUnits"
> {
  variationId: string | null;
  comment: string | null;
  modifiers: NormalizedCreateOrderItemModifierParams[];
  clientItemId: string | null;
  redeemFreeUnits: number;
}

export type OrderItemLineType = "paid" | "free";

export interface NormalizedCreateOrderParams extends Omit<
  CreateOrderParams,
  "comment" | "items" | "tip"
> {
  customerId: string | null;
  couponCode: string | null;
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

export interface OrderItemResponse extends Omit<OrderItem, "orderId"> {
  sourceClientItemId: string | null;
  lineType: OrderItemLineType;
  displayUnitPriceCents: number;
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
  promotionDiscountCents: number;
  couponDiscountCents: number;
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
      modifiers: OrderItemModifier[];
      taxes: OrderItemTax[];
    }
  >;
  paymentAttempts?: OrderPaymentAttempt[];
}

export interface OrderPromotionState {
  progressCount: number;
  candidateProductIds: string[];
}
