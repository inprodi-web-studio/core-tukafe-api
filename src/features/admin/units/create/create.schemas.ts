import { MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { z } from "zod";

export const createBodySchema = z
  .object({
    name: z.string().nonempty(),
    abbreviation: z.string().nonempty(),
    precision: z.number().int().min(0).max(MAX_SUPPORTED_DECIMAL_PLACES),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  abbreviation: z.string(),
  precision: z.number().int().min(0).max(MAX_SUPPORTED_DECIMAL_PLACES),
});

export type CreateResponse = z.infer<typeof createResponseSchema>;
