import {
  orderCouponCodeSchema,
  orderItemBodySchema,
  orderTipBodySchema,
} from "@features/shared/orders/create-order.schemas";
import { orderPaymentAttemptResponseSchema } from "@features/shared/orders/orders.schemas";
import { z } from "zod";

export const createPaymentAttemptBodySchema = z
  .object({
    customerId: z.string(),
    couponCode: orderCouponCodeSchema.nullish(),
    comment: z.string().nullish(),
    tip: orderTipBodySchema.nullish(),
    items: z.array(orderItemBodySchema).min(1),
    amountCents: z.number().int().positive(),
    currency: z.string().trim().length(3).default("MXN"),
  })
  .strict();

export const recordPaymentAttemptResultParamsSchema = z
  .object({
    paymentAttemptId: z.string(),
  })
  .strict();

export const recordPaymentAttemptResultBodySchema = z
  .object({
    status: z.enum(["paid", "cancelled", "failed"]),
    transactionId: z.string().nullish(),
    referenceNumber: z.string().nullish(),
    cardBrand: z.string().nullish(),
    entryMode: z.string().nullish(),
    authorizationCode: z.string().nullish(),
    obfuscatedPan: z.string().nullish(),
    amountCents: z.number().int().positive().nullish(),
    rawResponse: z.record(z.string(), z.unknown()).nullish(),
    failureCode: z.string().nullish(),
    failureMessage: z.string().nullish(),
  })
  .strict();

export const paymentAttemptResponseSchema = orderPaymentAttemptResponseSchema;

export type CreatePaymentAttemptBody = z.infer<typeof createPaymentAttemptBodySchema>;
export type RecordPaymentAttemptResultParams = z.infer<
  typeof recordPaymentAttemptResultParamsSchema
>;
export type RecordPaymentAttemptResultBody = z.infer<typeof recordPaymentAttemptResultBodySchema>;
