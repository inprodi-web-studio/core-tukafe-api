import type {
  CreateOrderParams,
  CreateOrderPaymentAttemptParams,
  OrderPaymentAttemptResponse,
  OrderResponse,
  RecordOrderPaymentAttemptResultParams,
} from "@features/shared/orders/orders.types";

export interface AdminOrdersService {
  create(input: CreateOrderServiceParams): Promise<OrderResponse>;
  createPaymentAttempt(input: CreateOrderPaymentAttemptServiceParams): Promise<OrderPaymentAttemptResponse>;
  recordPaymentAttemptResult(input: RecordOrderPaymentAttemptResultParams): Promise<OrderPaymentAttemptResponse>;
}

export type CreateOrderServiceParams = CreateOrderParams;
export type CreateOrderPaymentAttemptServiceParams = CreateOrderPaymentAttemptParams;

export type {
  CreateOrderItemModifierParams,
  CreateOrderItemParams,
  NormalizedCreateOrderItemModifierParams,
  NormalizedCreateOrderItemParams,
  NormalizedCreateOrderParams as NormalizedCreateOrderServiceParams,
  OrderCustomerResponse,
  OrderItemModifierResponse,
  OrderItemResponse,
  OrderItemTaxResponse,
  OrderWithRelations,
} from "@features/shared/orders/orders.types";
