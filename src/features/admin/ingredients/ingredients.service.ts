import {
  ingredientCategoriesDB,
  ingredientsDB,
  modifierOptionIngredientsDB,
  recipeIngredientsDB,
  unitsDB,
  variationRecipeIngredientsDB,
} from "@core/db/schemas";
import {
  buildFuzzySearch,
  conflict,
  generateNanoId,
  getPgError,
  notFound,
  paginate,
} from "@core/utils";
import { and, asc, countDistinct, eq, getTableColumns, isNull, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { normalizeIngredientInput, normalizeIngredientUpdateInput } from "./ingredients.helpers";
import type { AdminIngredientsService } from "./ingredients.types";

export function adminIngredientsService(fastify: FastifyInstance): AdminIngredientsService {
  return {
    async get(id, { safe = false } = {}) {
      const ingredient = await fastify.db.query.ingredientsDB.findFirst({
        where(ingredientTable, { and, eq, isNull }) {
          return and(eq(ingredientTable.id, id), isNull(ingredientTable.deletedAt));
        },
        columns: {
          baseUnitId: false,
          categoryId: false,
        },
        with: {
          baseUnit: true,
          category: true,
        },
      });

      if (!ingredient && !safe) {
        throw notFound("ingredient.notFound", "The ingredient was not found");
      }

      if (!ingredient) {
        return null;
      }

      return ingredient;
    },

    async list({ search, page, pageSize } = {}) {
      const defaultOrderBy: [SQL, ...SQL[]] = [asc(ingredientsDB.name), asc(ingredientsDB.id)];
      const fuzzySearch = buildFuzzySearch({
        query: search,
        values: [
          ingredientsDB.name,
          ingredientsDB.description,
          ingredientCategoriesDB.name,
          unitsDB.name,
          unitsDB.abbreviation,
        ],
        tieBreakers: defaultOrderBy,
      });

      return paginate({
        executor: fastify.db,
        createQuery: () => {
          const {
            baseUnitId: omittedBaseUnitId,
            categoryId: omittedCategoryId,
            ...ingredientColumns
          } = getTableColumns(ingredientsDB);

          void omittedBaseUnitId;
          void omittedCategoryId;

          const query = fastify.db
            .select({
              ...ingredientColumns,
              baseUnit: unitsDB,
              category: ingredientCategoriesDB,
            })
            .from(ingredientsDB)
            .innerJoin(unitsDB, eq(ingredientsDB.baseUnitId, unitsDB.id))
            .innerJoin(
              ingredientCategoriesDB,
              eq(ingredientsDB.categoryId, ingredientCategoriesDB.id),
            )
            .$dynamic();

          query.where(
            fuzzySearch.where
              ? and(isNull(ingredientsDB.deletedAt), fuzzySearch.where)
              : isNull(ingredientsDB.deletedAt),
          );

          return query;
        },
        orderBy: fuzzySearch.orderBy ?? defaultOrderBy,
        page,
        pageSize,
      });
    },

    async create(input) {
      const { name, categoryId, baseCostPerUnit, description, baseUnitId } =
        normalizeIngredientInput(input);

      try {
        await fastify.admin.units.get(baseUnitId);

        await fastify.admin.ingredientCategories.get(categoryId);

        const [createdIngredient] = await fastify.db
          .insert(ingredientsDB)
          .values({
            id: generateNanoId(),
            name,
            categoryId,
            baseCostPerUnit,
            description,
            baseUnitId,
          })
          .returning();

        if (!createdIngredient) {
          throw new Error("Faile to create ingredient");
        }

        const ingredient = await fastify.admin.ingredients.get(createdIngredient.id);

        if (!ingredient) {
          throw new Error("Failed to retrieve created ingredient");
        }

        return ingredient;
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505" && pgError.constraint === "ingredient_name_active_unique") {
          throw conflict("ingredient.duplicatedName", "A ingredient with this name already exists");
        }

        throw error;
      }
    },

    async update(id, input) {
      await fastify.admin.ingredients.get(id);
      const normalizedInput = normalizeIngredientUpdateInput(input);

      if (normalizedInput.baseUnitId) {
        await fastify.admin.units.get(normalizedInput.baseUnitId);
      }
      if (normalizedInput.categoryId) {
        await fastify.admin.ingredientCategories.get(normalizedInput.categoryId);
      }

      try {
        const [updated] = await fastify.db
          .update(ingredientsDB)
          .set({ ...normalizedInput, updatedAt: sql`now()` })
          .where(and(eq(ingredientsDB.id, id), isNull(ingredientsDB.deletedAt)))
          .returning({ id: ingredientsDB.id });

        if (!updated) {
          throw notFound("ingredient.notFound", "The ingredient was not found");
        }

        const ingredient = await fastify.admin.ingredients.get(updated.id);
        if (!ingredient) throw new Error("Failed to retrieve updated ingredient");
        return ingredient;
      } catch (error) {
        const pgError = getPgError(error);
        if (pgError?.code === "23505" && pgError.constraint === "ingredient_name_active_unique") {
          throw conflict(
            "ingredient.duplicatedName",
            "An ingredient with this name already exists",
          );
        }
        throw error;
      }
    },

    async remove(id) {
      await fastify.db.transaction(async (tx) => {
        const [ingredient] = await tx
          .select({ id: ingredientsDB.id })
          .from(ingredientsDB)
          .where(eq(ingredientsDB.id, id))
          .limit(1)
          .for("update");
        if (!ingredient) throw notFound("ingredient.notFound", "The ingredient was not found");

        const [productRecipes] = await tx
          .select({ count: countDistinct(recipeIngredientsDB.recipeId) })
          .from(recipeIngredientsDB)
          .where(eq(recipeIngredientsDB.ingredientId, id));
        const [variationRecipes] = await tx
          .select({ count: countDistinct(variationRecipeIngredientsDB.variationId) })
          .from(variationRecipeIngredientsDB)
          .where(eq(variationRecipeIngredientsDB.ingredientId, id));
        const [modifierOptions] = await tx
          .select({ count: countDistinct(modifierOptionIngredientsDB.modifierOptionId) })
          .from(modifierOptionIngredientsDB)
          .where(eq(modifierOptionIngredientsDB.ingredientId, id));

        const dependencies = {
          productRecipes: Number(productRecipes?.count ?? 0),
          variationRecipes: Number(variationRecipes?.count ?? 0),
          modifierOptions: Number(modifierOptions?.count ?? 0),
        };
        if (Object.values(dependencies).some((count) => count > 0)) {
          throw conflict(
            "ingredient.inUse",
            "The ingredient is still used by recipes or modifiers",
            dependencies,
          );
        }

        await tx.delete(ingredientsDB).where(eq(ingredientsDB.id, id));
      });
    },
  };
}
