import type {
  CreateOrderParams,
  OrderPreviewResponse,
  OrderResponse,
} from "@features/shared/orders/orders.types";

export interface CustomerOrdersService {
  preview(input: CreateCustomerOrderServiceParams): Promise<OrderPreviewResponse>;
  create(input: CreateCustomerOrderServiceParams): Promise<OrderResponse>;
}

export type CreateCustomerOrderServiceParams = CreateOrderParams;

export type {
  CreateOrderItemModifierParams,
  CreateOrderItemParams,
  OrderCustomerResponse,
  OrderItemModifierResponse,
  OrderItemResponse,
  OrderItemTaxResponse,
} from "@features/shared/orders/orders.types";
