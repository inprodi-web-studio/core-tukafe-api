import { generateNanoId, normalizeString, toBase100Integer } from "@core/utils";
import type {
  CreateProductModifierParams,
  CreateProductRecipeParams,
  CreateProductServiceParams,
  CreateProductVariationParams,
  NormalizedProductModifierParams,
  NormalizedProductVariationParams,
  ValidatedProductModifierConfig,
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

function normalizeProductModifierInput({
  modifierId,
  optionIds,
  visibleWhen,
}: CreateProductModifierParams): NormalizedProductModifierParams {
  return {
    modifierId,
    optionIds: optionIds == null ? null : [...optionIds],
    visibleWhen:
      visibleWhen?.map(({ variationGroupId, variationOptionId }) => ({
        variationGroupId,
        variationOptionId,
      })) ?? [],
  };
}

export const normalizeProductInput = ({
  name,
  price,
  recipe,
  imageUploadId,
  categoryId,
  categoryIds,
  taxIds,
  organizationIds,
  modifiers,
  modifierIds,
  modifierConfigs,
  isFeatured,
  variationGroupIds,
  variations,
  ...rest
}: CreateProductServiceParams) => {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });
  const normalizedRecipe = normalizeRecipeInput(recipe);
  const normalizedImageUploadId = imageUploadId
    ? normalizeString(imageUploadId, {
        trim: true,
        collapseWhitespace: true,
      })
    : null;
  const normalizedCategoryIds = [
    ...new Set([...(categoryId ? [categoryId] : []), ...(categoryIds ?? [])]),
  ];
  const normalizedModifierConfigs =
    modifierConfigs?.map(normalizeProductModifierInput) ??
    (modifierIds ?? modifiers ?? []).map((modifierId) => ({
      modifierId,
      optionIds: null,
      visibleWhen: [],
    }));

  return {
    name: normalizedName,
    priceCents: price == null ? null : toBase100Integer(price),
    recipe: normalizedRecipe,
    imageUploadId: normalizedImageUploadId,
    categoryId: categoryId ?? normalizedCategoryIds[0] ?? null,
    categoryIds: normalizedCategoryIds,
    isFeatured: isFeatured ?? false,
    taxIds: [...new Set(taxIds ?? [])],
    organizationIds: [...new Set(organizationIds ?? [])],
    modifierConfigs: normalizedModifierConfigs,
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
  modifierConfigs: ValidatedProductModifierConfig[],
  startSortOrder: number,
) {
  return modifierConfigs.map(({ modifierId }, index) => ({
    productId,
    modifierId,
    sortOrder: startSortOrder + index,
  }));
}

export function buildProductModifierOptionInsertPayloads(
  productId: string,
  modifierConfigs: ValidatedProductModifierConfig[],
) {
  return modifierConfigs.flatMap(
    ({ modifierId, optionIds }) =>
      optionIds?.map((modifierOptionId) => ({
        productId,
        modifierId,
        modifierOptionId,
      })) ?? [],
  );
}

export function buildProductModifierVisibilityRuleInsertPayloads(
  productId: string,
  modifierConfigs: ValidatedProductModifierConfig[],
) {
  return modifierConfigs.flatMap(({ modifierId, visibleWhen }) =>
    visibleWhen.map(({ variationGroupId, variationOptionId }) => ({
      productId,
      modifierId,
      variationGroupId,
      variationOptionId,
    })),
  );
}
