import { hasAtMostDecimalPlaces } from "@core/utils";
import { z } from "zod";

export const createBodySchema = z
  .object({
    name: z.string().nonempty(),
    description: z.string().nullish(),
    baseUnitId: z.nanoid(),
    categoryId: z.nanoid(),
    baseCostPerUnit: z
      .number()
      .nonnegative()
      .refine(
        (value) => hasAtMostDecimalPlaces(value, 6),
        "Base cost per unit must have at most 6 decimal places",
      ),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  baseCostPerUnit: z.number().nonnegative(),
  baseUnit: z.object({
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
