import {
  orderCouponCodeSchema,
  orderCashbackRedeemCentsSchema,
  orderPreparationDelayMinutesSchema,
  orderItemBodySchema,
  orderTipBodySchema,
} from "@features/shared/orders/create-order.schemas";
import { orderPreviewResponseSchema } from "@features/shared/orders/orders.schemas";
import { z } from "zod";

export const previewBodySchema = z
  .object({
    organizationId: z.string(),
    couponCode: orderCouponCodeSchema.nullish(),
    cashbackRedeemCents: orderCashbackRedeemCentsSchema.nullish(),
    preparationDelayMinutes: orderPreparationDelayMinutesSchema.nullish(),
    comment: z.string().nullish(),
    tip: orderTipBodySchema.nullish(),
    items: z.array(orderItemBodySchema),
  })
  .strict();

export type PreviewBody = z.infer<typeof previewBodySchema>;

export const previewResponseSchema = orderPreviewResponseSchema;

export type PreviewResponse = z.infer<typeof previewResponseSchema>;
