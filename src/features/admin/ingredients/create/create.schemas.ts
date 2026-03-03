import { z } from "zod";

export const createBodySchema = z
  .object({
    name: z.string().nonempty(),
    description: z.string().nullish(),
    unitId: z.nanoid(),
    categoryId: z.nanoid(),
    baseCost: z.number().nonnegative(),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  baseCostCents: z.number().nonnegative(),
  unit: z.object({
    id: z.string(),
    name: z.string(),
    abbreviation: z.string(),
    precision: z.number(),
  }),
  category: z.object({
    id: z.string(),
    name: z.string(),
    icon: z.string(),
    color: z.string(),
  }),
});

export type CreateResponse = z.infer<typeof createResponseSchema>;
