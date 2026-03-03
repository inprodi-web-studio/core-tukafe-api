import { supplyCategoriesDB } from "@core/db/schemas";
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
import { normalizeSupplyCategoryInput } from "./supplyCategories.helpers";
import type { AdminSupplyCategoriesService } from "./supplyCategories.types";

export function adminSupplyCategoriesService(fastify: FastifyInstance): AdminSupplyCategoriesService {
  return {
    async get(id, { safe = false } = {}) {
      const category = await fastify.db.query.supplyCategoriesDB.findFirst({
        where(categoryTable, { eq }) {
          return eq(categoryTable.id, id);
        },
      });

      if (!category && !safe) {
        throw notFound("supplyCategory.notFound", "The supply category was not found");
      }

      if (!category) {
        return null;
      }

      return category;
    },

    async list({ search, page, pageSize } = {}) {
      const defaultOrderBy: [SQL, ...SQL[]] = [asc(supplyCategoriesDB.name), asc(supplyCategoriesDB.id)];
      const fuzzySearch = buildFuzzySearch({
        query: search,
        values: [supplyCategoriesDB.name],
        tieBreakers: defaultOrderBy,
      });

      return paginate({
        executor: fastify.db,
        createQuery: () => {
          const query = fastify.db.select().from(supplyCategoriesDB).$dynamic();

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
      const { name, icon, color } = normalizeSupplyCategoryInput(input);

      try {
        const [createdCategory] = await fastify.db
          .insert(supplyCategoriesDB)
          .values({
            id: generateNanoId(),
            name,
            icon,
            color,
          })
          .returning();

        if (!createdCategory) {
          throw new Error("Failed to create supply category");
        }

        return createdCategory;
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505" && pgError.constraint === "supply_category_name_unique") {
          throw conflict(
            "supplyCategory.duplicatedName",
            "A supply category with this name already exists",
          );
        }

        throw error;
      }
    },
  };
}
