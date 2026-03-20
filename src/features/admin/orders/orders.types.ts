import type { CreateOrderParams, OrderResponse } from "@features/shared/orders/orders.types";

export interface AdminOrdersService {
  create(input: CreateOrderServiceParams): Promise<OrderResponse>;
}

export type CreateOrderServiceParams = CreateOrderParams;

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
