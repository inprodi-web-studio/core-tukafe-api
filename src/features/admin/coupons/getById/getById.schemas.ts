import { z } from "zod";
import { couponResponseSchema } from "../coupons.schemas";

export const paramsSchema = z
  .object({
    couponId: z.nanoid(),
  })
  .strict();

export type Params = z.infer<typeof paramsSchema>;

export const getByIdResponseSchema = couponResponseSchema;
export type GetByIdResponse = z.infer<typeof getByIdResponseSchema>;
