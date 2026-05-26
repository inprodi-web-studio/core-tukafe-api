import type {
  OrderCouponResponse,
  OrderPaymentAttemptResponse,
  OrderPromotionResponse,
  OrderResponse,
  OrderWithRelations,
} from "./orders.types";

export function mapOrderResponse(
  order: OrderWithRelations,
  promotion: OrderPromotionResponse | null = null,
  coupon: OrderCouponResponse | null = null,
): OrderResponse {
  return {
    ...order,
    customerId: order.customerId ?? null,
    comment: order.comment ?? null,
    customer: order.customer
      ? {
          id: order.customer.id,
          userId: order.customer.userId ?? null,
          name: order.customer.name ?? null,
          middleName: order.customer.middleName ?? null,
          lastName: order.customer.lastName ?? null,
          email: order.customer.email ?? null,
          phoneNumber: order.customer.phone ?? null,
        }
      : null,
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
        promotionCode: item.promotionCode ?? null,
        couponDiscountCents: item.couponDiscountCents ?? 0,
        sourceClientItemId: null,
        lineType: "paid",
        displayUnitPriceCents:
          item.unitPriceCents +
          (item.quantity > 0 ? Math.round(item.modifiersSubtotalCents / item.quantity) : 0),
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
    promotion,
    coupon,
    payment: order.paymentAttempts?.[0]
      ? ({
          ...order.paymentAttempts[0],
          provider: "zettle",
          status: order.paymentAttempts[0].status as OrderPaymentAttemptResponse["status"],
        } satisfies OrderPaymentAttemptResponse)
      : null,
  };
}
