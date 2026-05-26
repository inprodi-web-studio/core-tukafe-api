import type {
  CreateOrderParams,
  CreateOrderPaymentAttemptParams,
  OrderPreviewResponse,
  OrderPaymentAttemptResponse,
  OrderResponse,
  RecordOrderPaymentAttemptResultParams,
} from "@features/shared/orders/orders.types";

export interface GuestOrdersService {
  create(input: CreateGuestOrderServiceParams): Promise<OrderResponse>;
  createPaymentAttempt(input: CreateGuestOrderPaymentAttemptServiceParams): Promise<OrderPaymentAttemptResponse>;
  preview(input: CreateOrderParams): Promise<OrderPreviewResponse>;
  recordPaymentAttemptResult(input: RecordOrderPaymentAttemptResultParams): Promise<OrderPaymentAttemptResponse>;
}

export interface CreateGuestOrderServiceParams extends CreateOrderParams {
  customerName?: string | null;
}

export interface CreateGuestOrderPaymentAttemptServiceParams
  extends CreateOrderPaymentAttemptParams {
  customerName?: string | null;
}

export type {
  CreateOrderItemModifierParams,
  CreateOrderItemParams,
  OrderCustomerResponse,
  OrderItemModifierResponse,
  OrderItemResponse,
  OrderItemTaxResponse,
} from "@features/shared/orders/orders.types";
