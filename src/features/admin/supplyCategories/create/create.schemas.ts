import { z } from "zod";

export const createBodySchema = z
  .object({
    name: z.string().nonempty(),
    icon: z.string().nonempty(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex code"),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
});

export type CreateResponse = z.infer<typeof createResponseSchema>;
