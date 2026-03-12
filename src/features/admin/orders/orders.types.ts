import type { Order, OrderItem, OrderItemModifier, OrderItemTax, User } from "@core/db/schemas";

export interface AdminOrdersService {
  create(input: CreateOrderServiceParams): Promise<OrderResponse>;
}

export interface CreateOrderServiceParams {
  organizationId: string;
  customerId: string;
  comment?: string | null;
  items: CreateOrderItemParams[];
}

export interface CreateOrderItemParams {
  productId: string;
  variationId?: string | null;
  quantity: number;
  comment?: string | null;
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

export interface NormalizedCreateOrderItemParams
  extends Omit<CreateOrderItemParams, "variationId" | "comment" | "modifiers"> {
  variationId: string | null;
  comment: string | null;
  modifiers: NormalizedCreateOrderItemModifierParams[];
}

export interface NormalizedCreateOrderServiceParams
  extends Omit<CreateOrderServiceParams, "comment" | "items"> {
  comment: string | null;
  items: NormalizedCreateOrderItemParams[];
}

export interface OrderCustomerResponse {
  id: string;
  name: string;
  middleName: string | null;
  lastName: string | null;
  email: string;
  phoneNumber: string | null;
}

export type OrderItemModifierResponse = Omit<OrderItemModifier, "orderItemId">;

export type OrderItemTaxResponse = Omit<OrderItemTax, "orderItemId">;

export interface OrderItemResponse extends Omit<OrderItem, "orderId"> {
  modifiers: OrderItemModifierResponse[];
  taxes: OrderItemTaxResponse[];
}

export interface OrderResponse extends Order {
  customer: OrderCustomerResponse;
  items: OrderItemResponse[];
}

export interface OrderWithRelations extends Order {
  customer: Pick<User, "id" | "name" | "middleName" | "lastName" | "email" | "phoneNumber"> | null;
  items: Array<
    OrderItem & {
      modifiers: OrderItemModifier[];
      taxes: OrderItemTax[];
    }
  >;
}
