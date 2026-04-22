import type { OrderResponse, OrderWithRelations } from "./orders.types";

export function mapOrderResponse(order: OrderWithRelations): OrderResponse {
  if (!order.customer) {
    throw new Error("Order customer relation was not found");
  }

  return {
    ...order,
    comment: order.comment ?? null,
    customer: {
      id: order.customer.id,
      userId: order.customer.userId ?? null,
      name: order.customer.name ?? null,
      middleName: order.customer.middleName ?? null,
      lastName: order.customer.lastName ?? null,
      email: order.customer.email ?? null,
      phoneNumber: order.customer.phone ?? null,
    },
    items: [...order.items]
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        return left.id.localeCompare(right.id);
      })
      .map(({ orderId: _orderId, ...item }) => ({
        ...item,
        variationId: item.variationId ?? null,
        variationName: item.variationName ?? null,
        comment: item.comment ?? null,
        modifiers: [...item.modifiers]
          .sort((left, right) => {
            if (left.sortOrder !== right.sortOrder) {
              return left.sortOrder - right.sortOrder;
            }

            return left.id.localeCompare(right.id);
          })
          .map(({ orderItemId: _orderItemId, ...modifier }) => modifier),
        taxes: [...item.taxes]
          .sort((left, right) => {
            if (left.taxName !== right.taxName) {
              return left.taxName.localeCompare(right.taxName);
            }

            return left.taxId.localeCompare(right.taxId);
          })
          .map(({ orderItemId: _orderItemId, ...tax }) => tax),
      })),
  };
}
