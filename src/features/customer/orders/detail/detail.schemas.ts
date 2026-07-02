import { orderResponseSchema } from "@features/shared/orders";
import { z } from "zod";

export const getCustomerOrderParamsSchema = z
  .object({
    orderId: z.string().min(1),
  })
  .strict();

export type GetCustomerOrderParams = z.infer<typeof getCustomerOrderParamsSchema>;

export const getCustomerOrderResponseSchema = orderResponseSchema;
