import { ingredientCategoriesDB, ingredientsDB, unitsDB } from "@core/db/schemas";
import {
  buildFuzzySearch,
  conflict,
  generateNanoId,
  getPgError,
  notFound,
  paginate,
} from "@core/utils";
import { and, asc, eq, getTableColumns, isNull, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { normalizeIngredientInput } from "./ingredients.helpers";
import type { AdminIngredientsService } from "./ingredients.types";

export function adminIngredientsService(fastify: FastifyInstance): AdminIngredientsService {
  return {
    async get(id, { safe = false } = {}) {
      const ingredient = await fastify.db.query.ingredientsDB.findFirst({
        where(ingredientTable, { eq }) {
          return eq(ingredientTable.id, id);
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
  };
}
