import { orderItemBodySchema } from "@features/shared/orders/create-order.schemas";
import { orderResponseSchema } from "@features/shared/orders/orders.schemas";
import { z } from "zod";

export const createBodySchema = z
  .object({
    organizationId: z.string(),
    comment: z.string().nullish(),
    items: z.array(orderItemBodySchema).min(1),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = orderResponseSchema;

export type CreateResponse = z.infer<typeof createResponseSchema>;
