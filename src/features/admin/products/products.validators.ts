import {
  assertUniqueValues,
  hasAtMostDecimalPlaces,
  MAX_SUPPORTED_DECIMAL_PLACES,
  notFound,
  validation,
} from "@core/utils";
import type { FastifyInstance } from "fastify";
import { sortVariationGroupResponse } from "./products.mappers";
import type {
  CreateProductRecipeIngredientParams,
  CreateProductRecipeParams,
  CreateProductRecipeSupplyParams,
  CreateProductServiceParams,
  NormalizedProductVariationParams,
  ProductVariationGroupResponse,
  ValidatedProductRecipe,
  ValidatedProductVariationConfig,
} from "./products.types";

function resolveAllowedRecipeDecimalPlaces(unitPrecision: number): number {
  return Math.max(0, Math.min(unitPrecision, MAX_SUPPORTED_DECIMAL_PLACES));
}

function validateRecipeQuantity(
  quantity: number,
  unitPrecision: number,
  code: string,
  label: string,
  name: string,
) {
  const allowedDecimalPlaces = resolveAllowedRecipeDecimalPlaces(unitPrecision);

  if (!hasAtMostDecimalPlaces(quantity, allowedDecimalPlaces)) {
    throw validation(
      code,
      `${label} "${name}" quantity must have at most ${allowedDecimalPlaces} decimal places`,
    );
  }
}

async function validateRecipeIngredients(
  fastify: FastifyInstance,
  ingredients: CreateProductRecipeIngredientParams[],
) {
  if (ingredients.length === 0) {
    return ingredients;
  }

  const ingredientIds = ingredients.map(({ ingredientId }) => ingredientId);

  assertUniqueValues(
    ingredientIds,
    "recipe.duplicateIngredient",
    "Recipe ingredients cannot contain duplicates",
  );

  const matchedIngredients = await fastify.db.query.ingredientsDB.findMany({
    where(table, { and, inArray, isNull }) {
      return and(inArray(table.id, ingredientIds), isNull(table.deletedAt));
    },
    columns: {
      id: true,
      name: true,
    },
    with: {
      baseUnit: {
        columns: {
          precision: true,
        },
      },
    },
  });

  if (matchedIngredients.length !== ingredientIds.length) {
    throw notFound("ingredient.notFound", "One or more ingredients were not found");
  }

  const ingredientMap = new Map(
    matchedIngredients.map((ingredient) => [ingredient.id, ingredient]),
  );

  for (const ingredientInput of ingredients) {
    const ingredient = ingredientMap.get(ingredientInput.ingredientId);

    if (!ingredient) {
      throw notFound("ingredient.notFound", "One or more ingredients were not found");
    }

    validateRecipeQuantity(
      ingredientInput.quantity,
      ingredient.baseUnit.precision,
      "recipeIngredient.invalidQuantityPrecision",
      "Ingredient",
      ingredient.name,
    );
  }

  return ingredients;
}

async function validateRecipeSupplies(
  fastify: FastifyInstance,
  supplies: CreateProductRecipeSupplyParams[],
) {
  if (supplies.length === 0) {
    return supplies;
  }

  const supplyIds = supplies.map(({ supplyId }) => supplyId);
  assertUniqueValues(
    supplyIds,
    "recipe.duplicateSupply",
    "Recipe supplies cannot contain duplicates",
  );

  const matchedSupplies = await fastify.db.query.suppliesDB.findMany({
    where(table, { and, inArray, isNull }) {
      return and(inArray(table.id, supplyIds), isNull(table.deletedAt));
    },
    columns: {
      id: true,
      name: true,
    },
    with: {
      baseUnit: {
        columns: {
          precision: true,
        },
      },
    },
  });

  if (matchedSupplies.length !== supplyIds.length) {
    throw notFound("supply.notFound", "One or more supplies were not found");
  }

  const supplyMap = new Map(matchedSupplies.map((supply) => [supply.id, supply]));

  for (const supplyInput of supplies) {
    const supply = supplyMap.get(supplyInput.supplyId);

    if (!supply) {
      throw notFound("supply.notFound", "One or more supplies were not found");
    }

    validateRecipeQuantity(
      supplyInput.quantity,
      supply.baseUnit.precision,
      "recipeSupply.invalidQuantityPrecision",
      "Supply",
      supply.name,
    );
  }

  return supplies;
}

async function validateOptionalRecipe(
  fastify: FastifyInstance,
  recipe?: CreateProductRecipeParams,
): Promise<ValidatedProductRecipe | null> {
  if (!recipe) {
    return null;
  }

  const ingredients = await validateRecipeIngredients(fastify, recipe.ingredients ?? []);
  const supplies = await validateRecipeSupplies(fastify, recipe.supplies ?? []);

  if (ingredients.length === 0 && supplies.length === 0) {
    throw validation(
      "product.recipeEmpty",
      "Recipe must include at least one ingredient or supply",
    );
  }

  return {
    description: recipe.description ?? null,
    ingredients,
    supplies,
  };
}

export async function validateProductRecipe(
  fastify: FastifyInstance,
  productType: CreateProductServiceParams["productType"],
  hasVariations: boolean,
  recipe?: CreateProductRecipeParams,
): Promise<ValidatedProductRecipe | null> {
  if (productType === "assembled" && hasVariations && recipe) {
    throw validation(
      "product.recipeNotAllowed",
      "Assembled products with variations cannot include a base recipe",
    );
  }

  if (productType === "assembled" && !hasVariations && !recipe) {
    throw validation(
      "product.recipeRequired",
      "Assembled products without variations require a recipe",
    );
  }

  if (productType !== "assembled" && recipe) {
    throw validation("product.recipeNotAllowed", "Only assembled products can include a recipe");
  }

  return validateOptionalRecipe(fastify, recipe);
}

export async function validateProductModifiers(
  fastify: FastifyInstance,
  modifierIds: string[],
): Promise<string[]> {
  if (modifierIds.length === 0) {
    return [];
  }

  assertUniqueValues(
    modifierIds,
    "product.duplicateModifier",
    "Product modifiers cannot contain duplicates",
  );

  const matchedModifiers = await fastify.db.query.modifiersDB.findMany({
    where(table, { inArray }) {
      return inArray(table.id, modifierIds);
    },
    columns: {
      id: true,
    },
  });

  if (matchedModifiers.length !== modifierIds.length) {
    throw notFound("modifier.notFound", "One or more modifiers were not found");
  }

  return modifierIds;
}

export function validateProductBasePrice(priceCents: number | null, variationsCount: number) {
  if (variationsCount > 0 && priceCents !== null) {
    throw validation(
      "product.basePriceNotAllowed",
      "Products with variations cannot include a base price",
    );
  }

  if (variationsCount === 0 && priceCents === null) {
    throw validation(
      "product.basePriceRequired",
      "Products without variations require a base price",
    );
  }

  return priceCents;
}

function buildVariationCombinationKey(
  variationGroupsById: ReadonlyMap<string, ProductVariationGroupResponse>,
  selections: Array<{
    variationGroupId: string;
    variationOptionId: string;
  }>,
) {
  return [...selections]
    .sort((left, right) => {
      const leftGroup = variationGroupsById.get(left.variationGroupId);
      const rightGroup = variationGroupsById.get(right.variationGroupId);

      if (!leftGroup || !rightGroup) {
        return left.variationGroupId.localeCompare(right.variationGroupId);
      }

      if (leftGroup.sortOrder !== rightGroup.sortOrder) {
        return leftGroup.sortOrder - rightGroup.sortOrder;
      }

      return leftGroup.id.localeCompare(rightGroup.id);
    })
    .map(({ variationGroupId, variationOptionId }) => `${variationGroupId}:${variationOptionId}`)
    .join("|");
}

export async function validateProductVariations(
  fastify: FastifyInstance,
  productType: CreateProductServiceParams["productType"],
  variationGroupIds: string[],
  variations: NormalizedProductVariationParams[],
): Promise<ValidatedProductVariationConfig> {
  if (variationGroupIds.length === 0) {
    if (variations.length > 0) {
      throw validation(
        "product.variationGroupsRequired",
        "Products with variations must include variation groups",
      );
    }

    return {
      variationGroups: [],
      variations: [],
    };
  }

  assertUniqueValues(
    variationGroupIds,
    "product.duplicateVariationGroup",
    "Product variation groups cannot contain duplicates",
  );

  const matchedVariationGroups = await fastify.db.query.variationGroupsDB.findMany({
    where(table, { inArray }) {
      return inArray(table.id, variationGroupIds);
    },
    with: {
      options: true,
    },
  });

  if (matchedVariationGroups.length !== variationGroupIds.length) {
    throw notFound("variationGroup.notFound", "One or more variation groups were not found");
  }

  const variationGroupsById = new Map(
    matchedVariationGroups.map((variationGroup) => [
      variationGroup.id,
      sortVariationGroupResponse(variationGroup),
    ]),
  );

  const orderedVariationGroups = variationGroupIds.map((variationGroupId) => {
    const variationGroup = variationGroupsById.get(variationGroupId);

    if (!variationGroup) {
      throw notFound("variationGroup.notFound", "One or more variation groups were not found");
    }

    return variationGroup;
  });

  if (variations.length === 0) {
    return {
      variationGroups: orderedVariationGroups,
      variations: [],
    };
  }

  const variationCombinationKeys: string[] = [];
  const validatedVariations = [];

  for (const variation of variations) {
    const selectedGroupIds = variation.selections.map(({ variationGroupId }) => variationGroupId);

    assertUniqueValues(
      selectedGroupIds,
      "productVariation.duplicateSelectionGroup",
      "Each variation must select each variation group at most once",
    );

    if (variation.selections.length !== orderedVariationGroups.length) {
      throw validation(
        "productVariation.incompleteSelection",
        "Each variation must include one option for every product variation group",
      );
    }

    for (const selection of variation.selections) {
      const variationGroup = variationGroupsById.get(selection.variationGroupId);

      if (!variationGroup) {
        throw validation(
          "productVariation.invalidSelectionGroup",
          "Variation selections must belong to the product variation groups",
        );
      }

      const option = variationGroup.options.find(
        (variationOption) => variationOption.id === selection.variationOptionId,
      );

      if (!option) {
        throw validation(
          "productVariation.invalidSelectionOption",
          "Variation selections must use an option that belongs to its variation group",
        );
      }
    }

    const combinationKey = buildVariationCombinationKey(variationGroupsById, variation.selections);

    if (productType === "assembled" && !variation.recipe) {
      throw validation(
        "productVariation.recipeRequired",
        "Each variation must include a recipe for assembled products",
      );
    }

    if (productType !== "assembled" && variation.recipe) {
      throw validation(
        "productVariation.recipeNotAllowed",
        "Only assembled products can include recipes in variations",
      );
    }

    const validatedRecipe = await validateOptionalRecipe(fastify, variation.recipe);

    variationCombinationKeys.push(combinationKey);
    validatedVariations.push({
      priceCents: variation.priceCents,
      kitchenName: variation.kitchenName ?? null,
      customerDescription: variation.customerDescription ?? null,
      kitchenDescription: variation.kitchenDescription ?? null,
      selections: [...variation.selections],
      recipe: validatedRecipe,
      combinationKey,
    });
  }

  assertUniqueValues(
    variationCombinationKeys,
    "productVariation.duplicateCombination",
    "Product variations cannot contain duplicate option combinations",
  );

  return {
    variationGroups: orderedVariationGroups,
    variations: validatedVariations,
  };
}
