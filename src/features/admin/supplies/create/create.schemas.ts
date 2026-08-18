import { hasAtMostDecimalPlaces, MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { z } from "zod";

export const createBodySchema = z
  .object({
    name: z.string().trim().min(1),
    description: z.string().nullish(),
    baseUnitId: z.nanoid(),
    categoryId: z.nanoid(),
    baseCostPerUnit: z
      .number()
      .nonnegative()
      .refine(
        (value) => hasAtMostDecimalPlaces(value, MAX_SUPPORTED_DECIMAL_PLACES),
        `Base cost per unit must have at most ${MAX_SUPPORTED_DECIMAL_PLACES} decimal places`,
      ),
    isInventoryTracked: z.boolean().optional(),
    tracksLots: z.boolean().optional(),
    isPerishable: z.boolean().optional(),
    expirationWarningDays: z.number().int().min(0).max(365).optional(),
  })
  .strict();

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  baseCostPerUnit: z.number().nonnegative(),
  isInventoryTracked: z.boolean(),
  tracksLots: z.boolean(),
  isPerishable: z.boolean(),
  expirationWarningDays: z.number().int().nonnegative(),
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
