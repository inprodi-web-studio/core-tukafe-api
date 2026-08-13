import { z } from "zod";

export const ingredientCategoryParamsSchema = z.object({ categoryId: z.nanoid() }).strict();
export const updateIngredientCategoryBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    icon: z.string().trim().min(1).optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export type IngredientCategoryParams = z.infer<typeof ingredientCategoryParamsSchema>;
export type UpdateIngredientCategoryBody = z.infer<typeof updateIngredientCategoryBodySchema>;
