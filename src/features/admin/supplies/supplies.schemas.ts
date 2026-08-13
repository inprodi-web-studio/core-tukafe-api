import { hasAtMostDecimalPlaces, MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { z } from "zod";

export const supplyParamsSchema = z.object({ supplyId: z.nanoid() }).strict();

export const updateSupplyBodySchema = z
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
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export type SupplyParams = z.infer<typeof supplyParamsSchema>;
export type UpdateSupplyBody = z.infer<typeof updateSupplyBodySchema>;
