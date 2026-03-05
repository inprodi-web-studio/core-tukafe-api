import {
  modifierOptionIngredientsDB,
  modifierOptionsDB,
  modifierOptionSuppliesDB,
  modifiersDB,
} from "@core/db/schemas";
import {
  assertUniqueValues,
  buildFuzzySearch,
  conflict,
  generateNanoId,
  getPgError,
  notFound,
  paginate,
  validation,
} from "@core/utils";
import { asc, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  hasAtMostDecimalPlaces,
  mapModifierResponse,
  MAX_SUPPORTED_DECIMAL_PLACES,
  normalizeModifierInput,
} from "./modifiers.helpers";
import type { AdminModifiersService, CreateModifierServiceParams } from "./modifiers.types";

function resolveAllowedDecimalPlaces(unitPrecision: number): number {
  return Math.max(0, Math.min(unitPrecision, MAX_SUPPORTED_DECIMAL_PLACES));
}

function validateQuantityPrecision(
  quantity: number,
  unitPrecision: number,
  code: string,
  label: string,
  name: string,
) {
  const allowedDecimalPlaces = resolveAllowedDecimalPlaces(unitPrecision);

  if (!hasAtMostDecimalPlaces(quantity, allowedDecimalPlaces)) {
    throw validation(
      code,
      `${label} "${name}" quantity must have at most ${allowedDecimalPlaces} decimal places`,
    );
  }
}

async function validateModifierOptionIngredients(
  fastify: FastifyInstance,
  options: ReturnType<typeof normalizeModifierInput>["options"],
) {
  const ingredientIds = options.flatMap((option) =>
    option.ingredients.map(({ ingredientId }) => ingredientId),
  );

  if (ingredientIds.length === 0) {
    return;
  }

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

  if (matchedIngredients.length !== new Set(ingredientIds).size) {
    throw notFound("ingredient.notFound", "One or more ingredients were not found");
  }

  const ingredientsById = new Map(
    matchedIngredients.map((ingredient) => [ingredient.id, ingredient]),
  );

  for (const option of options) {
    const optionIngredientIds = option.ingredients.map(({ ingredientId }) => ingredientId);

    assertUniqueValues(
      optionIngredientIds,
      "modifierOption.duplicateIngredient",
      `Modifier option "${option.name}" cannot contain duplicate ingredients`,
    );

    for (const ingredientInput of option.ingredients) {
      const ingredient = ingredientsById.get(ingredientInput.ingredientId);

      if (!ingredient) {
        throw notFound("ingredient.notFound", "One or more ingredients were not found");
      }

      validateQuantityPrecision(
        ingredientInput.quantity,
        ingredient.baseUnit.precision,
        "modifierOptionIngredient.invalidQuantityPrecision",
        "Ingredient",
        ingredient.name,
      );
    }
  }
}

async function validateModifierOptionSupplies(
  fastify: FastifyInstance,
  options: ReturnType<typeof normalizeModifierInput>["options"],
) {
  const supplyIds = options.flatMap((option) => option.supplies.map(({ supplyId }) => supplyId));

  if (supplyIds.length === 0) {
    return;
  }

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

  if (matchedSupplies.length !== new Set(supplyIds).size) {
    throw notFound("supply.notFound", "One or more supplies were not found");
  }

  const suppliesById = new Map(matchedSupplies.map((supply) => [supply.id, supply]));

  for (const option of options) {
    const optionSupplyIds = option.supplies.map(({ supplyId }) => supplyId);

    assertUniqueValues(
      optionSupplyIds,
      "modifierOption.duplicateSupply",
      `Modifier option "${option.name}" cannot contain duplicate supplies`,
    );

    for (const supplyInput of option.supplies) {
      const supply = suppliesById.get(supplyInput.supplyId);

      if (!supply) {
        throw notFound("supply.notFound", "One or more supplies were not found");
      }

      validateQuantityPrecision(
        supplyInput.quantity,
        supply.baseUnit.precision,
        "modifierOptionSupply.invalidQuantityPrecision",
        "Supply",
        supply.name,
      );
    }
  }
}

function validateModifierConfig(input: ReturnType<typeof normalizeModifierInput>) {
  if (input.minSelect > input.options.length) {
    throw validation(
      "modifier.invalidMinSelect",
      "Modifier minSelect cannot be greater than the number of options",
    );
  }

  if (input.maxSelect !== null && input.maxSelect > input.options.length) {
    throw validation(
      "modifier.invalidMaxSelect",
      "Modifier maxSelect cannot be greater than the number of options",
    );
  }

  const defaultOptions = input.options.filter((option) => option.isDefault);

  if (defaultOptions.length > 1) {
    throw validation(
      "modifier.multipleDefaultOptions",
      "A modifier cannot contain more than one default option",
    );
  }
}

async function loadModifier(fastify: FastifyInstance, id: string, safe = false) {
  const modifier = await fastify.db.query.modifiersDB.findFirst({
    where(table, { eq }) {
      return eq(table.id, id);
    },
    with: {
      options: {
        columns: {
          modifierId: false,
        },
        with: {
          ingredients: {
            columns: {
              modifierOptionId: false,
              ingredientId: false,
            },
            with: {
              ingredient: {
                columns: {
                  baseUnitId: false,
                  categoryId: false,
                },
                with: {
                  baseUnit: true,
                  category: true,
                },
              },
            },
          },
          supplies: {
            columns: {
              modifierOptionId: false,
              supplyId: false,
            },
            with: {
              supply: {
                columns: {
                  baseUnitId: false,
                  categoryId: false,
                },
                with: {
                  baseUnit: true,
                  category: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!modifier && !safe) {
    throw notFound("modifier.notFound", "The modifier was not found");
  }

  return modifier ? mapModifierResponse(modifier) : null;
}

export function adminModifiersService(fastify: FastifyInstance): AdminModifiersService {
  return {
    async get(id, { safe = false } = {}) {
      return loadModifier(fastify, id, safe);
    },

    async list({ search, page, pageSize } = {}) {
      const defaultOrderBy: [SQL, ...SQL[]] = [asc(modifiersDB.name), asc(modifiersDB.id)];
      const fuzzySearch = buildFuzzySearch({
        query: search,
        values: [modifiersDB.name, modifiersDB.kitchenName, modifiersDB.customerLabel],
        tieBreakers: defaultOrderBy,
      });

      const paginatedModifiers = await paginate({
        executor: fastify.db,
        createQuery: () => {
          const query = fastify.db.select().from(modifiersDB).$dynamic();

          if (fuzzySearch.where) {
            query.where(fuzzySearch.where);
          }

          return query;
        },
        orderBy: fuzzySearch.orderBy ?? defaultOrderBy,
        page,
        pageSize,
      });

      if (paginatedModifiers.data.length === 0) {
        return {
          data: [],
          pagination: paginatedModifiers.pagination,
        };
      }

      const modifiers = await Promise.all(
        paginatedModifiers.data.map((modifier) => loadModifier(fastify, modifier.id, true)),
      );

      return {
        data: modifiers.filter((modifier) => modifier !== null),
        pagination: paginatedModifiers.pagination,
      };
    },

    async create(input: CreateModifierServiceParams) {
      const normalizedInput = normalizeModifierInput(input);

      assertUniqueValues(
        normalizedInput.options.map((option) => option.name),
        "modifier.duplicateOptionName",
        "Modifier options cannot contain duplicate names",
      );

      validateModifierConfig(normalizedInput);
      await Promise.all([
        validateModifierOptionIngredients(fastify, normalizedInput.options),
        validateModifierOptionSupplies(fastify, normalizedInput.options),
      ]);

      try {
        const createdModifierId = await fastify.db.transaction(async (tx) => {
          const [createdModifier] = await tx
            .insert(modifiersDB)
            .values({
              id: generateNanoId(),
              name: normalizedInput.name,
              kitchenName: normalizedInput.kitchenName,
              customerLabel: normalizedInput.customerLabel,
              multiSelect: normalizedInput.multiSelect,
              minSelect: normalizedInput.minSelect,
              maxSelect: normalizedInput.maxSelect,
            })
            .returning();

          if (!createdModifier) {
            throw new Error("Failed to create modifier");
          }

          const createdOptions = await tx
            .insert(modifierOptionsDB)
            .values(
              normalizedInput.options.map((option, index) => ({
                id: generateNanoId(),
                modifierId: createdModifier.id,
                name: option.name,
                kitchenName: option.kitchenName,
                customerName: option.customerName,
                priceCents: option.priceCents,
                sortOrder: index,
                isDefault: option.isDefault,
              })),
            )
            .returning({
              id: modifierOptionsDB.id,
            });

          const optionIds = createdOptions.map((option) => option.id);

          const optionIngredients = normalizedInput.options.flatMap((option, index) => {
            const modifierOptionId = optionIds[index];

            if (!modifierOptionId) {
              return [];
            }

            return option.ingredients.map(({ ingredientId, quantity }) => ({
              modifierOptionId,
              ingredientId,
              quantity,
            }));
          });

          if (optionIngredients.length > 0) {
            await tx.insert(modifierOptionIngredientsDB).values(optionIngredients);
          }

          const optionSupplies = normalizedInput.options.flatMap((option, index) => {
            const modifierOptionId = optionIds[index];

            if (!modifierOptionId) {
              return [];
            }

            return option.supplies.map(({ supplyId, quantity }) => ({
              modifierOptionId,
              supplyId,
              quantity,
            }));
          });

          if (optionSupplies.length > 0) {
            await tx.insert(modifierOptionSuppliesDB).values(optionSupplies);
          }

          return createdModifier.id;
        });

        const createdModifier = await loadModifier(fastify, createdModifierId, false);

        if (!createdModifier) {
          throw new Error("Failed to retrieve created modifier");
        }

        return createdModifier;
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505") {
          if (pgError.constraint === "modifier_name_unique") {
            throw conflict("modifier.duplicatedName", "A modifier with this name already exists");
          }

          if (pgError.constraint === "modifier_option_modifier_name_unique") {
            throw conflict(
              "modifier.duplicatedOptionName",
              "A modifier option with this name already exists in the modifier",
            );
          }

          if (pgError.constraint === "modifier_option_modifier_sort_order_unique") {
            throw conflict(
              "modifier.duplicatedOptionSortOrder",
              "A modifier option with this sort order already exists in the modifier",
            );
          }

          if (pgError.constraint === "modifier_option_single_default_unique") {
            throw conflict(
              "modifier.multipleDefaultOptions",
              "A modifier cannot contain more than one default option",
            );
          }
        }

        throw error;
      }
    },
  };
}
