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

const variationSelectionSchema = z.object({
  variationGroupId: z.nanoid(),
  variationOptionId: z.nanoid(),
});

const variationSchema = z.object({
  price: z.number().nonnegative(),
  kitchenName: z.string().nullish(),
  customerDescription: z.string().nullish(),
  kitchenDescription: z.string().nullish(),
  selections: z.array(variationSelectionSchema).min(1),
  recipe: recipeSchema.optional(),
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

const variationGroupOptionResponseSchema = z.object({
  id: z.string(),
  variationGroupId: z.string(),
  name: z.string(),
  sortOrder: z.number().int().min(0),
});

const variationGroupResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int().min(0),
  options: z.array(variationGroupOptionResponseSchema),
});

const variationResponseSchema = z.object({
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

const createBaseBodySchema = z.object({
  name: z.string().nonempty(),
  kitchenName: z.string().nullish(),
  price: z.number().nonnegative().optional(),
  customerDescription: z.string().nullish(),
  kitchenDescription: z.string().nullish(),
  unitId: z.nanoid(),
  categoryId: z.nanoid().nullish(),
  taxIds: z.array(z.string()).nullish(),
  variationGroupIds: z.array(z.nanoid()).min(1).optional(),
  variations: z.array(variationSchema).min(1).optional(),
});

export const createBodySchema = z
  .discriminatedUnion("productType", [
    createBaseBodySchema.extend({
      productType: z.literal("assembled"),
      recipe: recipeSchema.optional(),
    }),
    createBaseBodySchema.extend({
      productType: z.literal("simple"),
      recipe: z.never().optional(),
    }),
    createBaseBodySchema.extend({
      productType: z.literal("compound"),
      recipe: z.never().optional(),
    }),
  ])
  .superRefine((body, context) => {
    const variationsCount = body.variations?.length ?? 0;
    const variationGroupsCount = body.variationGroupIds?.length ?? 0;

    if (variationsCount > 0 && variationGroupsCount === 0) {
      context.addIssue({
        code: "custom",
        message: "Products with variations must include variation groups",
        path: ["variationGroupIds"],
      });
    }

    if (variationsCount > 0 && body.price !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Products with variations cannot include a base price",
        path: ["price"],
      });
    }

    if (variationsCount === 0 && body.price === undefined) {
      context.addIssue({
        code: "custom",
        message: "Products without variations require a base price",
        path: ["price"],
      });
    }

    if (body.productType === "assembled") {
      if (variationsCount > 0 && body.recipe !== undefined) {
        context.addIssue({
          code: "custom",
          message: "Assembled products with variations cannot include a base recipe",
          path: ["recipe"],
        });
      }

      if (variationsCount === 0 && body.recipe === undefined) {
        context.addIssue({
          code: "custom",
          message: "Assembled products without variations require a recipe",
          path: ["recipe"],
        });
      }

      body.variations?.forEach((variation, index) => {
        if (variation.recipe === undefined) {
          context.addIssue({
            code: "custom",
            message: "Each variation must include a recipe for assembled products",
            path: ["variations", index, "recipe"],
          });
        }
      });
    }

    if (body.productType !== "assembled") {
      body.variations?.forEach((variation, index) => {
        if (variation.recipe !== undefined) {
          context.addIssue({
            code: "custom",
            message: "Only assembled products can include recipes in variations",
            path: ["variations", index, "recipe"],
          });
        }
      });
    }
  });

export type CreateBody = z.infer<typeof createBodySchema>;

export const createResponseSchema = z.object({
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
  productType: z.string(),
  recipe: recipeResponseSchema.nullish(),
  variations: z.array(variationResponseSchema),
});

export type CreateResponse = z.infer<typeof createResponseSchema>;
