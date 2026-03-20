import { generateNanoId, normalizeString, toBase100Integer } from "@core/utils";
import type {
  CreateProductRecipeParams,
  CreateProductServiceParams,
  CreateProductVariationParams,
  NormalizedProductVariationParams,
  ValidatedProductVariation,
} from "./products.types";

function normalizeRecipeInput(recipe?: CreateProductRecipeParams) {
  if (!recipe) {
    return undefined;
  }

  return {
    ...recipe,
    description: normalizeString(recipe.description, {
      trim: true,
      collapseWhitespace: true,
    }),
    ingredients: recipe.ingredients ?? [],
    supplies: recipe.supplies ?? [],
  };
}

function normalizeProductVariationInput({
  price,
  recipe,
  ...rest
}: CreateProductVariationParams): NormalizedProductVariationParams {
  return {
    ...rest,
    priceCents: toBase100Integer(price),
    recipe: normalizeRecipeInput(recipe),
  };
}

export const normalizeProductInput = ({
  name,
  price,
  recipe,
  taxIds,
  organizationIds,
  modifiers,
  modifierIds,
  variationGroupIds,
  variations,
  ...rest
}: CreateProductServiceParams) => {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });
  const normalizedRecipe = normalizeRecipeInput(recipe);

  return {
    name: normalizedName,
    priceCents: price == null ? null : toBase100Integer(price),
    recipe: normalizedRecipe,
    taxIds: [...new Set(taxIds ?? [])],
    organizationIds: [...new Set(organizationIds ?? [])],
    modifierIds: [...new Set(modifierIds ?? modifiers ?? [])],
    variationGroupIds: variationGroupIds ?? [],
    variations: (variations ?? []).map(normalizeProductVariationInput),
    ...rest,
  };
};

export const normalizeProductVariationsInput = (
  variations: CreateProductVariationParams[],
): NormalizedProductVariationParams[] => variations.map(normalizeProductVariationInput);

export function buildProductVariationInsertPayloads(
  productId: string,
  variations: ValidatedProductVariation[],
  startSortOrder: number,
) {
  const createdVariations = variations.map((variation, index) => ({
    id: generateNanoId(),
    productId,
    combinationKey: variation.combinationKey,
    sortOrder: startSortOrder + index,
    priceCents: variation.priceCents,
    kitchenName: variation.kitchenName,
    customerDescription: variation.customerDescription,
    kitchenDescription: variation.kitchenDescription,
  }));

  const variationSelections = createdVariations.flatMap(
    (createdVariation, index) =>
      variations[index]?.selections.map((selection) => ({
        variationId: createdVariation.id,
        variationGroupId: selection.variationGroupId,
        variationOptionId: selection.variationOptionId,
      })) ?? [],
  );

  const variationRecipes = createdVariations
    .map((createdVariation, index) => ({
      variationId: createdVariation.id,
      recipe: variations[index]?.recipe ?? null,
    }))
    .filter((variation) => variation.recipe);

  const variationRecipeIngredients = variationRecipes.flatMap(
    ({ variationId, recipe: variationRecipe }) =>
      variationRecipe?.ingredients.map(({ ingredientId, quantity }) => ({
        variationId,
        ingredientId,
        quantity,
      })) ?? [],
  );

  const variationRecipeSupplies = variationRecipes.flatMap(
    ({ variationId, recipe: variationRecipe }) =>
      variationRecipe?.supplies.map(({ supplyId, quantity }) => ({
        variationId,
        supplyId,
        quantity,
      })) ?? [],
  );

  return {
    createdVariations,
    variationSelections,
    variationRecipes,
    variationRecipeIngredients,
    variationRecipeSupplies,
  };
}

export function buildProductModifierInsertPayloads(
  productId: string,
  modifierIds: string[],
  startSortOrder: number,
) {
  return modifierIds.map((modifierId, index) => ({
    productId,
    modifierId,
    sortOrder: startSortOrder + index,
  }));
}
