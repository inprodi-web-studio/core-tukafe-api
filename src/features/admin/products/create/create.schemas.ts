import { hasAtMostDecimalPlaces, MAX_SUPPORTED_DECIMAL_PLACES } from "@core/utils";
import { z } from "zod";

const recipeIngredientSchema = z.object({
  ingredientId: z.nanoid(),
  quantity: z
    .number()
    .positive()
    .refine(
      (value) => hasAtMostDecimalPlaces(value, MAX_SUPPORTED_DECIMAL_PLACES),
      `Quantity must have at most ${MAX_SUPPORTED_DECIMAL_PLACES} decimal places`,
    ),
});

const recipeSupplySchema = z.object({
  supplyId: z.nanoid(),
  quantity: z
    .number()
    .positive()
    .refine(
      (value) => hasAtMostDecimalPlaces(value, MAX_SUPPORTED_DECIMAL_PLACES),
      `Quantity must have at most ${MAX_SUPPORTED_DECIMAL_PLACES} decimal places`,
    ),
});

const recipeSchema = z
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

const recipeItemIngredientSchema = z.object({
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

const recipeItemSupplySchema = z.object({
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

const recipeResponseSchema = z.object({
  description: z.string().nullish(),
  ingredients: z.array(recipeItemIngredientSchema),
  supplies: z.array(recipeItemSupplySchema),
});

const createBaseBodySchema = z.object({
  name: z.string().nonempty(),
  kitchenName: z.string().nullish(),
  price: z.number().nonnegative(),
  customerDescription: z.string().nullish(),
  kitchenDescription: z.string().nullish(),
  unitId: z.nanoid(),
  categoryId: z.nanoid().nullish(),
  taxIds: z.array(z.string()).nullish(),
});

export const createBodySchema = z.discriminatedUnion("productType", [
  createBaseBodySchema.extend({
    productType: z.literal("assembled"),
    recipe: recipeSchema,
  }),
  createBaseBodySchema.extend({
    productType: z.literal("simple"),
    recipe: z.never().optional(),
  }),
  createBaseBodySchema.extend({
    productType: z.literal("compound"),
    recipe: z.never().optional(),
  }),
]);

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  kitchenName: z.string().nullish(),
  priceCents: z.number().nonnegative(),
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
  productType: z.string(),
  recipe: recipeResponseSchema.nullish(),
});

export type CreateResponse = z.infer<typeof createResponseSchema>;
