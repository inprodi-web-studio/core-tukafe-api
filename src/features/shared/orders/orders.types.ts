import type { Customer, Order, OrderItem, OrderItemModifier, OrderItemTax } from "@core/db/schemas";

export interface CreateOrderParams {
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

export interface NormalizedCreateOrderParams
  extends Omit<CreateOrderParams, "comment" | "items"> {
  comment: string | null;
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
  modifiers: OrderItemModifierResponse[];
  taxes: OrderItemTaxResponse[];
}

export interface OrderResponse extends Order {
  customer: OrderCustomerResponse;
  items: OrderItemResponse[];
}

export interface OrderWithRelations extends Order {
  customer: Pick<Customer, "id" | "userId" | "name" | "middleName" | "lastName" | "email" | "phone"> | null;
  items: Array<
    OrderItem & {
      modifiers: OrderItemModifier[];
      taxes: OrderItemTax[];
    }
  >;
}
