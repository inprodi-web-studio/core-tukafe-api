import { mapModifierResponse } from "../modifiers/modifiers.helpers";
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
    categories: [...product.categories]
      .sort((left, right) => {
        if (left.category.sortOrder !== right.category.sortOrder) {
          return left.category.sortOrder - right.category.sortOrder;
        }

        if (left.category.name !== right.category.name) {
          return left.category.name.localeCompare(right.category.name);
        }

        return left.category.id.localeCompare(right.category.id);
      })
      .map(({ category }) => category),
    organizations: [...product.organizations]
      .sort((left, right) => {
        if (left.organization.name !== right.organization.name) {
          return left.organization.name.localeCompare(right.organization.name);
        }

        return left.organization.id.localeCompare(right.organization.id);
      })
      .map(({ organization }) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        address: organization.address,
        latitude: organization.latitude,
        longitude: organization.longitude,
        logo: organization.logo,
      })),
    modifiers: [...product.modifiers]
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }

        if (left.modifier.name !== right.modifier.name) {
          return left.modifier.name.localeCompare(right.modifier.name);
        }

        return left.modifier.id.localeCompare(right.modifier.id);
      })
      .map(({ allowedOptions, modifier, visibilityRules }) => {
        const allowedOptionIds = allowedOptions.map((option) => option.modifierOptionId);
        const allowedOptionIdsSet = new Set(allowedOptionIds);
        const hasOptionScope = allowedOptionIds.length > 0;
        const scopedModifier = mapModifierResponse({
          ...modifier,
          options: hasOptionScope
            ? modifier.options.filter((option) => allowedOptionIdsSet.has(option.id))
            : modifier.options,
        });

        return {
          ...scopedModifier,
          optionScope: hasOptionScope ? ("subset" as const) : ("all" as const),
          allowedOptionIds: hasOptionScope
            ? scopedModifier.options.map((option) => option.id)
            : null,
          visibleWhen: [...visibilityRules]
            .sort((left, right) => {
              if (left.variationGroupId !== right.variationGroupId) {
                return left.variationGroupId.localeCompare(right.variationGroupId);
              }

              return left.variationOptionId.localeCompare(right.variationOptionId);
            })
            .map(({ variationGroupId, variationOptionId }) => ({
              variationGroupId,
              variationOptionId,
            })),
        };
      }),
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
