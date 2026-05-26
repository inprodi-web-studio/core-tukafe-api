import { z } from "zod";
import { couponResponseSchema } from "../coupons.schemas";

export const paramsSchema = z
  .object({
    couponId: z.nanoid(),
  })
  .strict();

export type Params = z.infer<typeof paramsSchema>;

export const updateStatusBodySchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export type UpdateStatusBody = z.infer<typeof updateStatusBodySchema>;

export const updateStatusResponseSchema = couponResponseSchema;
export type UpdateStatusResponse = z.infer<typeof updateStatusResponseSchema>;
