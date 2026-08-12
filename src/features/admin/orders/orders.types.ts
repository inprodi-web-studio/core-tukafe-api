import type {
  CreateOrderParams,
  CreateOrderPaymentAttemptParams,
  OrderPaymentAttemptResponse,
  OrderResponse,
  RecordOrderPaymentAttemptResultParams,
} from "@features/shared/orders/orders.types";
import type { PaginatedResult } from "@core/utils";
import type {
  AdminOrderDetail,
  AdminOrderListItem,
  AdminOrdersListQuery,
} from "./orders.read.schemas";

export interface ListAdminOrdersParams extends AdminOrdersListQuery {
  organizationId: string;
}

export interface AdminOrdersService {
  list(input: ListAdminOrdersParams): Promise<PaginatedResult<AdminOrderListItem>>;
  get(organizationId: string, orderId: string): Promise<AdminOrderDetail>;
  create(input: CreateOrderServiceParams): Promise<OrderResponse>;
  createPaymentAttempt(
    input: CreateOrderPaymentAttemptServiceParams,
  ): Promise<OrderPaymentAttemptResponse>;
  recordPaymentAttemptResult(
    input: RecordOrderPaymentAttemptResultParams,
  ): Promise<OrderPaymentAttemptResponse>;
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
