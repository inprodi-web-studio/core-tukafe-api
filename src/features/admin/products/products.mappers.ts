import type {
  ProductVariationGroupResponse,
  ProductResponse,
  ProductWithRelations,
  RecipeDetailsResponse,
} from "./products.types";

function mapRecipeResponse(recipe: RecipeDetailsResponse): RecipeDetailsResponse {
  return {
    ...recipe,
    description: recipe.description ?? null,
    createdAt: recipe.createdAt ?? null,
    updatedAt: recipe.updatedAt ?? null,
  };
}

function sortVariationGroupResponse(variationGroup: ProductVariationGroupResponse) {
  return {
    ...variationGroup,
    options: [...variationGroup.options].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      if (left.name !== right.name) {
        return left.name.localeCompare(right.name);
      }

      return left.id.localeCompare(right.id);
    }),
  };
}

export { sortVariationGroupResponse };

export const mapProductResponse = (product: ProductWithRelations): ProductResponse => {
  return {
    ...product,
    taxes: product.taxes.map(({ tax }) => tax),
    recipe: product.recipe ? mapRecipeResponse(product.recipe) : null,
    variationGroups: [...product.variationGroups]
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        if (left.group.name !== right.group.name) {
          return left.group.name.localeCompare(right.group.name);
        }

        return left.group.id.localeCompare(right.group.id);
      })
      .map(({ group }) => sortVariationGroupResponse(group)),
    variations: [...product.variations]
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        return left.id.localeCompare(right.id);
      })
      .map((variation) => ({
        ...variation,
        selections: [...variation.selections].sort((left, right) => {
          if (left.group.sortOrder !== right.group.sortOrder) {
            return left.group.sortOrder - right.group.sortOrder;
          }

          if (left.group.name !== right.group.name) {
            return left.group.name.localeCompare(right.group.name);
          }

          return left.group.id.localeCompare(right.group.id);
        }),
        recipe: variation.recipe ? mapRecipeResponse(variation.recipe) : null,
      })),
  };
};
