import {
  orderItemBodySchema,
  orderCouponCodeSchema,
  orderPaymentAttemptIdSchema,
  orderTipBodySchema,
} from "@features/shared/orders/create-order.schemas";
import { z } from "zod";
import { orderResponseSchema } from "../orders.schemas";

export const createBodySchema = z
  .object({
    customerId: z.string(),
    paymentAttemptId: orderPaymentAttemptIdSchema.nullish(),
    couponCode: orderCouponCodeSchema.nullish(),
    comment: z.string().nullish(),
    tip: orderTipBodySchema.nullish(),
    items: z.array(orderItemBodySchema).min(1),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = orderResponseSchema;

export type CreateResponse = z.infer<typeof createResponseSchema>;
