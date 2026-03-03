import { ingredientCategoriesDB } from "@core/db/schemas";
import {
  buildFuzzySearch,
  conflict,
  generateNanoId,
  getPgError,
  notFound,
  paginate,
} from "@core/utils";
import { asc, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { normalizeIngredientCategoryInput } from "./ingredientCategories.helpers";
import type { AdminIngredientCategoriesService } from "./ingredientCategories.types";

export function adminIngredientCategoriesService(
  fastify: FastifyInstance,
): AdminIngredientCategoriesService {
  return {
    async get(id, { safe = false } = {}) {
      const category = await fastify.db.query.ingredientCategoriesDB.findFirst({
        where(categoryTable, { eq }) {
          return eq(categoryTable.id, id);
        },
      });

      if (!category && !safe) {
        throw notFound("ingredientCategory.notFound", "The ingredient category was not found");
      }

      if (!category) {
        return null;
      }

      return category;
    },

    async list({ search, page, pageSize } = {}) {
      const defaultOrderBy: [SQL, ...SQL[]] = [
        asc(ingredientCategoriesDB.name),
        asc(ingredientCategoriesDB.id),
      ];
      const fuzzySearch = buildFuzzySearch({
        query: search,
        values: [ingredientCategoriesDB.name],
        tieBreakers: defaultOrderBy,
      });

      return paginate({
        executor: fastify.db,
        createQuery: () => {
          const query = fastify.db.select().from(ingredientCategoriesDB).$dynamic();

          if (fuzzySearch.where) {
            query.where(fuzzySearch.where);
          }

          return query;
        },
        orderBy: fuzzySearch.orderBy ?? defaultOrderBy,
        page,
        pageSize,
      });
    },

    async create(input) {
      const { name, icon, color } = normalizeIngredientCategoryInput(input);

      try {
        const [createdCategory] = await fastify.db
          .insert(ingredientCategoriesDB)
          .values({
            id: generateNanoId(),
            name,
            icon,
            color,
          })
          .returning();

        if (!createdCategory) {
          throw new Error("Failed to create ingredient category");
        }

        return createdCategory;
      } catch (error) {
        const pgError = getPgError(error);

        if (
          pgError?.code === "23505" &&
          pgError.constraint === "ingredient_category_name_unique"
        ) {
          throw conflict(
            "ingredientCategory.duplicatedName",
            "An ingredient category with this name already exists",
          );
        }

        throw error;
      }
    },
  };
}
