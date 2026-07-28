import {
  orderCouponCodeSchema,
  orderCashbackRedeemCentsSchema,
  orderPreparationDelayMinutesSchema,
  orderItemBodySchema,
  orderTipBodySchema,
} from "@features/shared/orders/create-order.schemas";
import { orderPaymentAttemptResponseSchema } from "@features/shared/orders/orders.schemas";
import { z } from "zod";

export const createPaymentSheetBodySchema = z
  .object({
    organizationId: z.string(),
    couponCode: orderCouponCodeSchema.nullish(),
    cashbackRedeemCents: orderCashbackRedeemCentsSchema.nullish(),
    preparationDelayMinutes: orderPreparationDelayMinutesSchema.nullish(),
    comment: z.string().nullish(),
    tip: orderTipBodySchema.nullish(),
    items: z.array(orderItemBodySchema).min(1),
    amountCents: z.number().int().positive(),
    currency: z.string().trim().length(3).default("MXN"),
  })
  .strict();

export const createPaymentSheetResponseSchema = z.object({
  paymentAttemptId: z.string(),
  publishableKey: z.string(),
  paymentIntentClientSecret: z.string(),
  stripeCustomerId: z.string(),
  customerEphemeralKeySecret: z.string(),
  amountCents: z.number().int().positive(),
  currency: z.string(),
  wallets: z.object({
    applePay: z
      .object({
        merchantIdentifier: z.string(),
        merchantCountryCode: z.string(),
      })
      .nullable(),
    googlePay: z
      .object({
        merchantCountryCode: z.string(),
        currencyCode: z.string(),
        testEnv: z.boolean(),
      })
      .nullable(),
  }),
});

export const confirmPaymentAttemptParamsSchema = z
  .object({
    paymentAttemptId: z.string(),
  })
  .strict();

export const confirmPaymentAttemptResponseSchema = orderPaymentAttemptResponseSchema;

export type CreatePaymentSheetBody = z.infer<typeof createPaymentSheetBodySchema>;
export type CreatePaymentSheetResponse = z.infer<typeof createPaymentSheetResponseSchema>;
export type ConfirmPaymentAttemptParams = z.infer<typeof confirmPaymentAttemptParamsSchema>;
