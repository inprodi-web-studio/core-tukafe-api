import { productCategoriesDB } from "@core/db/schemas";
import {
  buildFuzzySearch,
  conflict,
  generateNanoId,
  getPgError,
  notFound,
  paginate,
} from "@core/utils";
import { and, asc, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  buildProductCategoryTree,
  getDescendantTreeRows,
  getMatchedAncestorRows,
  getMatchedRootIds,
  normalizeProductCategoryInput,
} from "./productCategories.helpers";
import type { AdminProductcategoriesService } from "./productCategories.types";

export function adminProductcategoriesService(
  fastify: FastifyInstance,
): AdminProductcategoriesService {
  return {
    async get(id, { safe = false } = {}) {
      const category = await fastify.db.query.productCategoriesDB.findFirst({
        where(categoryTable, { eq }) {
          return eq(categoryTable.id, id);
        },
      });

      if (!category && !safe) {
        throw notFound("productCategory.notFound", "The product category was not found");
      }

      if (!category) {
        return null;
      }

      return category;
    },

    async list({ page, pageSize, search } = {}) {
      const defaultOrderBy: [SQL, ...SQL[]] = [
        asc(productCategoriesDB.name),
        asc(productCategoriesDB.id),
      ];
      const fuzzySearch = buildFuzzySearch({
        query: search,
        values: [productCategoriesDB.name],
      });

      const matchedRootIds = fuzzySearch.where
        ? await getMatchedRootIds(fastify.db, fuzzySearch.where)
        : null;

      const paginatedRoots = await paginate({
        executor: fastify.db,
        createQuery: () => {
          const query = fastify.db
            .select({
              id: productCategoriesDB.id,
            })
            .from(productCategoriesDB)
            .$dynamic();

          const whereCondition =
            matchedRootIds === null
              ? isNull(productCategoriesDB.parentId)
              : matchedRootIds.length === 0
                ? and(isNull(productCategoriesDB.parentId), sql`false`)
                : and(
                    isNull(productCategoriesDB.parentId),
                    inArray(productCategoriesDB.id, matchedRootIds),
                  );

          query.where(whereCondition);

          return query;
        },
        orderBy: defaultOrderBy,
        page,
        pageSize,
      });

      if (paginatedRoots.data.length === 0) {
        return {
          data: [],
          pagination: paginatedRoots.pagination,
        };
      }

      const paginatedRootIds = paginatedRoots.data.map((root) => root.id);
      const categories =
        fuzzySearch.where && matchedRootIds
          ? await getMatchedAncestorRows(fastify.db, fuzzySearch.where, paginatedRootIds)
          : await getDescendantTreeRows(fastify.db, paginatedRootIds);

      const tree = buildProductCategoryTree(categories);

      return {
        data: tree,
        pagination: paginatedRoots.pagination,
      };
    },

    async create(input) {
      const { name, parentId, color, icon } = normalizeProductCategoryInput(input);

      if (parentId) {
        await fastify.admin.productCategories.get(parentId);
      }

      try {
        const [createdCategory] = await fastify.db
          .insert(productCategoriesDB)
          .values({
            id: generateNanoId(),
            name,
            icon,
            color,
            parentId,
          })
          .returning();

        if (!createdCategory) {
          throw new Error("Failed to create product category");
        }

        return createdCategory;
      } catch (error) {
        const pgError = getPgError(error);

        if (
          pgError?.code === "23505" &&
          (pgError.constraint === "product_category_parent_name_unique" ||
            pgError.constraint === "product_category_root_name_unique")
        ) {
          throw conflict(
            "productCategory.duplicatedName",
            parentId
              ? "A category with this name already exists under the selected parent"
              : "A root category with this name already exists",
          );
        }

        throw error;
      }
    },
  };
}
