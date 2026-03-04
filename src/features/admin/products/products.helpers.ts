import { normalizeString, toBase100Integer } from "@core/utils";
import type {
  CreateProductRecipeParams,
  CreateProductServiceParams,
  CreateProductVariationParams,
  NormalizedProductVariationParams,
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
    variationGroupIds: variationGroupIds ?? [],
    variations: (variations ?? []).map(normalizeProductVariationInput),
    ...rest,
  };
};
