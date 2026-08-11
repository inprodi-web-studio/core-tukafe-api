import { z } from "zod";
import { productResponseSchema, recipeSchema, variationSchema } from "../product.schemas";

export const paramsSchema = z.object({ productId: z.nanoid() }).strict();

export const configurationResponseSchema = productResponseSchema.pick({
  id: true,
  productType: true,
  priceCents: true,
  recipe: true,
  variationGroups: true,
  variations: true,
  modifiers: true,
});

export const replaceVariationConfigurationBodySchema = z
  .object({
    variationGroupIds: z.array(z.nanoid()).max(10),
    variations: z.array(variationSchema).max(250),
    basePrice: z.number().nonnegative().optional(),
    baseRecipe: recipeSchema.optional(),
  })
  .strict()
  .superRefine((body, context) => {
    const hasVariations = body.variations.length > 0;

    if (hasVariations && body.variationGroupIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Products with variations must include variation groups",
        path: ["variationGroupIds"],
      });
    }

    if (!hasVariations && body.variationGroupIds.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Variation groups require at least one active variation",
        path: ["variationGroupIds"],
      });
    }

    if (hasVariations && body.basePrice !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Products with variations cannot include a base price",
        path: ["basePrice"],
      });
    }

    if (!hasVariations && body.basePrice === undefined) {
      context.addIssue({
        code: "custom",
        message: "Products without variations require a base price",
        path: ["basePrice"],
      });
    }
  });

const modifierVisibilityConditionSchema = z
  .object({
    variationGroupId: z.nanoid(),
    variationOptionId: z.nanoid(),
  })
  .strict();

const productModifierConfigurationSchema = z
  .object({
    modifierId: z.nanoid(),
    optionIds: z.array(z.nanoid()).min(1).nullable(),
    visibleWhen: z.array(modifierVisibilityConditionSchema),
  })
  .strict();

export const replaceModifiersBodySchema = z
  .object({
    modifiers: z.array(productModifierConfigurationSchema).max(100),
  })
  .strict();

export const replaceRecipeBodySchema = recipeSchema;

export type Params = z.infer<typeof paramsSchema>;
export type ReplaceVariationConfigurationBody = z.infer<
  typeof replaceVariationConfigurationBodySchema
>;
export type ReplaceModifiersBody = z.infer<typeof replaceModifiersBodySchema>;
export type ReplaceRecipeBody = z.infer<typeof replaceRecipeBodySchema>;
