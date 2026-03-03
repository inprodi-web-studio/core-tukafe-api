import {
  hasAtMostDecimalPlaces,
  MAX_SUPPORTED_DECIMAL_PLACES,
  normalizeString,
  notFound,
  toBase100Integer,
  validation,
} from "@core/utils";
import type { FastifyInstance } from "fastify";
import type {
  CreateProductRecipeIngredientParams,
  CreateProductRecipeParams,
  CreateProductRecipeSupplyParams,
  CreateProductServiceParams,
  ProductResponse,
  ProductWithRelations,
  ValidatedProductRecipe,
} from "./products.types";

export const normalizeProductInput = ({
  name,
  price,
  recipe,
  taxIds,
  ...rest
}: CreateProductServiceParams) => {
  const normalizedName = normalizeString(name, {
    trim: true,
    collapseWhitespace: true,
  });
  const normalizedRecipe = recipe
    ? {
        ...recipe,
        description: normalizeString(recipe.description, {
          trim: true,
          collapseWhitespace: true,
        }),
        ingredients: recipe.ingredients ?? [],
        supplies: recipe.supplies ?? [],
      }
    : undefined;

  return {
    name: normalizedName,
    priceCents: toBase100Integer(price),
    recipe: normalizedRecipe,
    taxIds: [...new Set(taxIds ?? [])],
    ...rest,
  };
};

export const mapProductResponse = (product: ProductWithRelations): ProductResponse => {
  return {
    ...product,
    taxes: product.taxes.map(({ tax }) => tax),
    recipe: product.recipe
      ? {
          ...product.recipe,
          ingredients: product.recipe.ingredients.map(({ ingredient, ...recipeIngredient }) => ({
            ...recipeIngredient,
            ingredient,
          })),
          supplies: product.recipe.supplies.map(({ supply, ...recipeSupply }) => ({
            ...recipeSupply,
            supply,
          })),
        }
      : null,
  };
};

function assertUniqueRecipeReferences(ids: string[], code: string, message: string) {
  if (new Set(ids).size !== ids.length) {
    throw validation(code, message);
  }
}

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

  assertUniqueRecipeReferences(
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
  assertUniqueRecipeReferences(
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

export async function validateProductRecipe(
  fastify: FastifyInstance,
  productType: CreateProductServiceParams["productType"],
  recipe?: CreateProductRecipeParams,
): Promise<ValidatedProductRecipe | null> {
  if (productType === "assembled" && !recipe) {
    throw validation("product.recipeRequired", "Assembled products require a recipe");
  }

  if (productType !== "assembled" && recipe) {
    throw validation("product.recipeNotAllowed", "Only assembled products can include a recipe");
  }

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
