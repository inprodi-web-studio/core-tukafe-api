import { hasAtMostDecimalPlaces, MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { z } from "zod";
import { modifierResponseSchema } from "../modifiers/modifiers.schemas";

export const recipeIngredientSchema = z.object({
  ingredientId: z.nanoid(),
  quantity: z
    .number()
    .positive()
    .refine(
      (value) => hasAtMostDecimalPlaces(value, MAX_SUPPORTED_DECIMAL_PLACES),
      `Quantity must have at most ${MAX_SUPPORTED_DECIMAL_PLACES} decimal places`,
    ),
});

export const recipeSupplySchema = z.object({
  supplyId: z.nanoid(),
  quantity: z
    .number()
    .positive()
    .refine(
      (value) => hasAtMostDecimalPlaces(value, MAX_SUPPORTED_DECIMAL_PLACES),
      `Quantity must have at most ${MAX_SUPPORTED_DECIMAL_PLACES} decimal places`,
    ),
});

export const recipeSchema = z
  .object({
    description: z.string().nullish(),
    ingredients: z.array(recipeIngredientSchema).optional(),
    supplies: z.array(recipeSupplySchema).optional(),
  })
  .superRefine((recipe, context) => {
    const ingredientsCount = recipe.ingredients?.length ?? 0;
    const suppliesCount = recipe.supplies?.length ?? 0;

    if (ingredientsCount === 0 && suppliesCount === 0) {
      context.addIssue({
        code: "custom",
        message: "Recipe must include at least one ingredient or supply",
        path: ["ingredients"],
      });
    }
  });

export const variationSelectionSchema = z.object({
  variationGroupId: z.nanoid(),
  variationOptionId: z.nanoid(),
});

export const variationSchema = z.object({
  price: z.number().nonnegative(),
  kitchenName: z.string().nullish(),
  customerDescription: z.string().nullish(),
  kitchenDescription: z.string().nullish(),
  selections: z.array(variationSelectionSchema).min(1),
  recipe: recipeSchema.optional(),
});

export const recipeItemIngredientSchema = z.object({
  quantity: z.number().positive(),
  ingredient: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullish(),
    baseCostPerUnit: z.number().nonnegative(),
    baseUnit: z.object({
      id: z.string(),
      name: z.string(),
      abbreviation: z.string(),
      precision: z.number().nonnegative(),
    }),
    category: z.object({
      id: z.string(),
      name: z.string(),
      icon: z.string(),
      color: z.string(),
    }),
  }),
});

export const recipeItemSupplySchema = z.object({
  quantity: z.number().positive(),
  supply: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullish(),
    baseCostPerUnit: z.number().nonnegative(),
    baseUnit: z.object({
      id: z.string(),
      name: z.string(),
      abbreviation: z.string(),
      precision: z.number().nonnegative(),
    }),
    category: z.object({
      id: z.string(),
      name: z.string(),
      icon: z.string(),
      color: z.string(),
    }),
  }),
});

export const recipeResponseSchema = z.object({
  description: z.string().nullish(),
  ingredients: z.array(recipeItemIngredientSchema),
  supplies: z.array(recipeItemSupplySchema),
});

export const variationGroupOptionResponseSchema = z.object({
  id: z.string(),
  variationGroupId: z.string(),
  name: z.string(),
  sortOrder: z.number().int().min(0),
});

export const variationGroupResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int().min(0),
  options: z.array(variationGroupOptionResponseSchema),
});

export const variationResponseSchema = z.object({
  id: z.string(),
  sortOrder: z.number().int().min(0),
  priceCents: z.number().nonnegative(),
  kitchenName: z.string().nullish(),
  customerDescription: z.string().nullish(),
  kitchenDescription: z.string().nullish(),
  selections: z.array(
    z.object({
      group: variationGroupResponseSchema.omit({ options: true }),
      option: variationGroupOptionResponseSchema,
    }),
  ),
  recipe: recipeResponseSchema.nullish(),
});

export const productResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  kitchenName: z.string().nullish(),
  priceCents: z.number().nonnegative().nullable(),
  customerDescription: z.string(),
  kitchenDescription: z.string().nullish(),
  unit: z.object({
    id: z.string(),
    name: z.string(),
    abbreviation: z.string(),
    precision: z.number().nonnegative(),
  }),
  category: z
    .object({
      id: z.string(),
      name: z.string(),
      icon: z.string(),
      color: z.string(),
      parentId: z.string().nullish(),
    })
    .nullish(),
  taxes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      rate: z.number().int().nonnegative(),
    }),
  ),
  organizations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      address: z.string(),
      logo: z.string().nullish(),
    }),
  ),
  modifiers: z.array(modifierResponseSchema),
  productType: z.string(),
  recipe: recipeResponseSchema.nullish(),
  variationGroups: z.array(variationGroupResponseSchema),
  variations: z.array(variationResponseSchema),
});
