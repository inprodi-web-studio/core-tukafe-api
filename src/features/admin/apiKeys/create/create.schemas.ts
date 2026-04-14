import { z } from "zod";

export const createBodySchema = z
  .object({
    name: z.string().trim().min(1).max(32),
    expiresInSeconds: z.coerce.number().int().min(86_400).optional(),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  prefix: z.string().nullable(),
  start: z.string().nullable(),
  key: z.string(),
  expiresAt: z.string().nullable(),
});

export type CreateResponse = z.infer<typeof createResponseSchema>;
