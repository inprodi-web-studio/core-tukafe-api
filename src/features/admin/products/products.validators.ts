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
  NormalizedProductCompoundComponentParams,
  NormalizedProductModifierParams,
  NormalizedProductVariationParams,
  ProductVariationGroupResponse,
  ValidatedProductCompoundComponent,
  ValidatedProductModifierConfig,
  ValidatedProductRecipe,
  ValidatedProductVariationConfig,
} from "./products.types";

function resolveAllowedRecipeDecimalPlaces(unitPrecision: number): number {
  return Math.max(0, Math.min(unitPrecision, MAX_SUPPORTED_DECIMAL_PLACES));
}

export function calculateVariationMatrixSize(groups: ProductVariationGroupResponse[]): number {
  return groups.reduce((total, group) => total * group.options.length, groups.length > 0 ? 1 : 0);
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

export async function validateProductModifierConfigs(
  fastify: FastifyInstance,
  modifierConfigs: NormalizedProductModifierParams[],
  options: {
    variationGroups?: ProductVariationGroupResponse[];
  } = {},
): Promise<ValidatedProductModifierConfig[]> {
  if (modifierConfigs.length === 0) {
    return [];
  }

  const modifierIds = modifierConfigs.map(({ modifierId }) => modifierId);

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
      name: true,
      minSelect: true,
    },
    with: {
      options: {
        columns: {
          id: true,
        },
      },
    },
  });

  if (matchedModifiers.length !== modifierIds.length) {
    throw notFound("modifier.notFound", "One or more modifiers were not found");
  }

  const modifiersById = new Map(matchedModifiers.map((modifier) => [modifier.id, modifier]));

  const variationGroupsById = new Map(
    (options.variationGroups ?? []).map((variationGroup) => [variationGroup.id, variationGroup]),
  );

  return modifierConfigs.map(({ modifierId, optionIds, visibleWhen }) => {
    const modifier = modifiersById.get(modifierId);

    if (!modifier) {
      throw notFound("modifier.notFound", "One or more modifiers were not found");
    }

    if (optionIds === null) {
      return {
        modifierId,
        optionIds,
        visibleWhen: validateModifierVisibilityConditions(
          visibleWhen,
          variationGroupsById,
          modifier.name,
        ),
      };
    }

    if (optionIds.length === 0) {
      throw validation(
        "productModifier.emptyOptionScope",
        `Product modifier "${modifier.name}" must include at least one allowed option`,
      );
    }

    assertUniqueValues(
      optionIds,
      "productModifier.duplicateOption",
      `Product modifier "${modifier.name}" cannot contain duplicated options`,
    );

    if (modifier.minSelect > optionIds.length) {
      throw validation(
        "productModifier.minSelectImpossible",
        `Product modifier "${modifier.name}" requires at least ${modifier.minSelect} selection(s), but only ${optionIds.length} option(s) are allowed`,
      );
    }

    const modifierOptionIds = new Set(modifier.options.map((option) => option.id));
    const hasInvalidOption = optionIds.some((optionId) => !modifierOptionIds.has(optionId));

    if (hasInvalidOption) {
      throw validation(
        "productModifier.invalidOption",
        `One or more allowed options do not belong to modifier "${modifier.name}"`,
      );
    }

    return {
      modifierId,
      optionIds,
      visibleWhen: validateModifierVisibilityConditions(
        visibleWhen,
        variationGroupsById,
        modifier.name,
      ),
    };
  });
}

function validateModifierVisibilityConditions(
  visibleWhen: NormalizedProductModifierParams["visibleWhen"],
  variationGroupsById: ReadonlyMap<string, ProductVariationGroupResponse>,
  modifierName: string,
) {
  if (visibleWhen.length === 0) {
    return [];
  }

  if (variationGroupsById.size === 0) {
    throw validation(
      "productModifierVisibility.variationRequired",
      `Product modifier "${modifierName}" cannot include visibility rules without product variation groups`,
    );
  }

  const conditionKeys = visibleWhen.map(
    ({ variationGroupId, variationOptionId }) => `${variationGroupId}:${variationOptionId}`,
  );
  assertUniqueValues(
    conditionKeys,
    "productModifierVisibility.duplicateCondition",
    `Product modifier "${modifierName}" cannot contain duplicated visibility conditions`,
  );

  for (const condition of visibleWhen) {
    const variationGroup = variationGroupsById.get(condition.variationGroupId);

    if (!variationGroup) {
      throw validation(
        "productModifierVisibility.invalidVariationGroup",
        `Visibility rules for modifier "${modifierName}" must use variation groups assigned to the product`,
      );
    }

    const hasOption = variationGroup.options.some(
      (variationOption) => variationOption.id === condition.variationOptionId,
    );

    if (!hasOption) {
      throw validation(
        "productModifierVisibility.invalidVariationOption",
        `Visibility rules for modifier "${modifierName}" must use options that belong to their variation group`,
      );
    }
  }

  return [...visibleWhen];
}

export async function validateProductModifiers(
  fastify: FastifyInstance,
  modifierIds: string[],
): Promise<string[]> {
  const modifierConfigs = modifierIds.map((modifierId) => ({
    modifierId,
    optionIds: null,
    visibleWhen: [],
  }));
  const validatedConfigs = await validateProductModifierConfigs(fastify, modifierConfigs);

  return validatedConfigs.map(({ modifierId }) => modifierId);
}

export async function validateProductOrganizations(
  fastify: FastifyInstance,
  organizationIds: string[],
): Promise<string[]> {
  if (organizationIds.length === 0) {
    throw validation(
      "product.organizationRequired",
      "Products must be assigned to at least one organization",
    );
  }

  assertUniqueValues(
    organizationIds,
    "product.duplicateOrganization",
    "Product organizations cannot contain duplicates",
  );

  const matchedOrganizations = await fastify.db.query.organizationDB.findMany({
    where(table, { and, inArray, isNull }) {
      return and(inArray(table.id, organizationIds), isNull(table.deletedAt));
    },
    columns: {
      id: true,
    },
  });

  if (matchedOrganizations.length !== organizationIds.length) {
    throw notFound("organization.notFound", "One or more organizations were not found");
  }

  return organizationIds;
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

export async function validateProductCompoundComponents(
  fastify: FastifyInstance,
  productType: CreateProductServiceParams["productType"],
  components: NormalizedProductCompoundComponentParams[],
): Promise<ValidatedProductCompoundComponent[]> {
  if (productType !== "compound") {
    if (components.length > 0) {
      throw validation(
        "product.compoundComponentsNotAllowed",
        "Only compound products can include compound components",
      );
    }

    return [];
  }

  if (components.length === 0) {
    return [];
  }

  if (components.length < 2) {
    throw validation(
      "product.compoundComponentsRequired",
      "Compound products require at least two component products when compoundComponents is provided",
    );
  }

  assertUniqueValues(
    components.map((component) => component.sortOrder),
    "productCompoundComponent.duplicateSortOrder",
    "Compound product components cannot contain duplicated sort orders",
  );

  const componentProductIds = [...new Set(components.map((component) => component.productId))];
  const matchedProducts = await fastify.db.query.productsDB.findMany({
    where(table, { and, inArray, isNull }) {
      return and(inArray(table.id, componentProductIds), isNull(table.deletedAt));
    },
    columns: {
      id: true,
      productType: true,
    },
  });

  if (matchedProducts.length !== componentProductIds.length) {
    throw notFound(
      "productCompoundComponent.productNotFound",
      "One or more component products were not found",
    );
  }

  const matchedProductsById = new Map(matchedProducts.map((product) => [product.id, product]));

  return components.map((component) => {
    const matchedProduct = matchedProductsById.get(component.productId);

    if (!matchedProduct) {
      throw notFound(
        "productCompoundComponent.productNotFound",
        "One or more component products were not found",
      );
    }

    if (matchedProduct.productType === "compound") {
      throw validation(
        "productCompoundComponent.nestedCompoundNotAllowed",
        "Compound products cannot include compound products as components",
      );
    }

    if (!Number.isInteger(component.quantity) || component.quantity <= 0) {
      throw validation(
        "productCompoundComponent.invalidQuantity",
        "Compound component quantity must be a positive integer",
      );
    }

    if (!Number.isInteger(component.sortOrder) || component.sortOrder < 0) {
      throw validation(
        "productCompoundComponent.invalidSortOrder",
        "Compound component sortOrder must be a non-negative integer",
      );
    }

    return {
      componentProductId: component.productId,
      quantity: component.quantity,
      sortOrder: component.sortOrder,
      label: component.label,
    };
  });
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
      options: {
        columns: {
          imageUploadId: false,
        },
        with: {
          image: {
            columns: {
              id: true,
              name: true,
              path: true,
              visibility: true,
              mimeType: true,
            },
          },
        },
      },
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
