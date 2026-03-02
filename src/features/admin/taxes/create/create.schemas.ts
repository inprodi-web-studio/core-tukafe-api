import { hasAtMostTwoDecimals } from "@core/utils";
import { z } from "zod";

export const createBodySchema = z
  .object({
    name: z.string().nonempty(),
    rate: z
      .number()
      .min(0)
      .max(100)
      .refine(hasAtMostTwoDecimals, "Rate must have at most 2 decimal places"),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  rate: z.number().min(0).max(100),
});

export type CreateResponse = z.infer<typeof createResponseSchema>;
