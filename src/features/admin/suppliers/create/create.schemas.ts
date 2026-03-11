import { phoneSchema } from "@core/utils";
import { z } from "zod";

export const createBodySchema = z
  .object({
    name: z.string().nonempty(),
    email: z.email().nullish(),
    phone: phoneSchema.nullish(),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email().nullable(),
  phone: z.string().nullable(),
});

export type CreateResponse = z.infer<typeof createResponseSchema>;
