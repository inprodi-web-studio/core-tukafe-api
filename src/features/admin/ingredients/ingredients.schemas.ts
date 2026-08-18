import { hasAtMostDecimalPlaces, MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { z } from "zod";

export const ingredientParamsSchema = z.object({ ingredientId: z.nanoid() }).strict();

export const updateIngredientBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    baseUnitId: z.nanoid().optional(),
    categoryId: z.nanoid().optional(),
    baseCostPerUnit: z
      .number()
      .nonnegative()
      .refine(
        (value) => hasAtMostDecimalPlaces(value, MAX_SUPPORTED_DECIMAL_PLACES),
        `Base cost per unit must have at most ${MAX_SUPPORTED_DECIMAL_PLACES} decimal places`,
      )
      .optional(),
    isInventoryTracked: z.boolean().optional(),
    tracksLots: z.boolean().optional(),
    isPerishable: z.boolean().optional(),
    expirationWarningDays: z.number().int().min(0).max(365).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export type IngredientParams = z.infer<typeof ingredientParamsSchema>;
export type UpdateIngredientBody = z.infer<typeof updateIngredientBodySchema>;
