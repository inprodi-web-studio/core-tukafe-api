import { z } from "zod";

const optionSchema = z
  .object({
    name: z.string().nonempty(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict();

export const createBodySchema = z
  .object({
    name: z.string().nonempty(),
    options: z.array(optionSchema).min(1),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int().min(0),
  options: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      sortOrder: z.number().int().min(0),
    }),
  ),
});

export type CreateResponse = z.infer<typeof createResponseSchema>;
