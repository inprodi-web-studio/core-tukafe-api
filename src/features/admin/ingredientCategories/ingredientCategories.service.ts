import { ingredientCategoriesDB, ingredientsDB } from "@core/db/schemas";
import {
  buildFuzzySearch,
  conflict,
  generateNanoId,
  getPgError,
  notFound,
  paginate,
} from "@core/utils";
import { asc, count, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  normalizeIngredientCategoryInput,
  normalizeIngredientCategoryUpdateInput,
} from "./ingredientCategories.helpers";
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

        if (pgError?.code === "23505" && pgError.constraint === "ingredient_category_name_unique") {
          throw conflict(
            "ingredientCategory.duplicatedName",
            "An ingredient category with this name already exists",
          );
        }

        throw error;
      }
    },

    async update(id, input) {
      await fastify.admin.ingredientCategories.get(id);
      const normalizedInput = normalizeIngredientCategoryUpdateInput(input);

      try {
        const [updated] = await fastify.db
          .update(ingredientCategoriesDB)
          .set({ ...normalizedInput, updatedAt: sql`now()` })
          .where(eq(ingredientCategoriesDB.id, id))
          .returning();
        if (!updated) {
          throw notFound("ingredientCategory.notFound", "The ingredient category was not found");
        }
        return updated;
      } catch (error) {
        const pgError = getPgError(error);
        if (pgError?.code === "23505" && pgError.constraint === "ingredient_category_name_unique") {
          throw conflict(
            "ingredientCategory.duplicatedName",
            "An ingredient category with this name already exists",
          );
        }
        throw error;
      }
    },

    async remove(id) {
      await fastify.db.transaction(async (tx) => {
        const [category] = await tx
          .select({ id: ingredientCategoriesDB.id })
          .from(ingredientCategoriesDB)
          .where(eq(ingredientCategoriesDB.id, id))
          .limit(1)
          .for("update");
        if (!category) {
          throw notFound("ingredientCategory.notFound", "The ingredient category was not found");
        }

        const [dependency] = await tx
          .select({ count: count() })
          .from(ingredientsDB)
          .where(eq(ingredientsDB.categoryId, id));
        const items = Number(dependency?.count ?? 0);
        if (items > 0) {
          throw conflict(
            "ingredientCategory.inUse",
            "The ingredient category still contains ingredients",
            { items },
          );
        }

        await tx.delete(ingredientCategoriesDB).where(eq(ingredientCategoriesDB.id, id));
      });
    },
  };
}
