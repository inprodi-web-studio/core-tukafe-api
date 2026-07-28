import {
  orderItemBodySchema,
  orderCouponCodeSchema,
  orderCashbackRedeemCentsSchema,
  orderPreparationDelayMinutesSchema,
  orderPaymentAttemptIdSchema,
  orderTipBodySchema,
} from "@features/shared/orders/create-order.schemas";
import { orderResponseSchema } from "@features/shared/orders/orders.schemas";
import { z } from "zod";

export const createBodySchema = z
  .object({
    organizationId: z.string(),
    paymentAttemptId: orderPaymentAttemptIdSchema.nullish(),
    couponCode: orderCouponCodeSchema.nullish(),
    cashbackRedeemCents: orderCashbackRedeemCentsSchema.nullish(),
    preparationDelayMinutes: orderPreparationDelayMinutesSchema.nullish(),
    comment: z.string().nullish(),
    tip: orderTipBodySchema.nullish(),
    items: z.array(orderItemBodySchema).min(1),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = orderResponseSchema;

export type CreateResponse = z.infer<typeof createResponseSchema>;
