import type { CreateOrderParams, OrderResponse } from "@features/shared/orders/orders.types";

export interface CustomerOrdersService {
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
