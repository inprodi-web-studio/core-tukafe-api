import { productCategoriesDB } from "@core/db/schemas";
import {
  badRequest,
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
  normalizeProductCategoryUpdateInput,
} from "./productCategories.helpers";
import type { AdminProductCategoriesService } from "./productCategories.types";

export function adminProductcategoriesService(
  fastify: FastifyInstance,
): AdminProductCategoriesService {
  return {
    async get(id, { safe = false } = {}) {
      const category = await fastify.db.query.productCategoriesDB.findFirst({
        where(categoryTable, { eq }) {
          return eq(categoryTable.id, id);
        },
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
        asc(productCategoriesDB.sortOrder),
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
      const {
        name,
        parentId,
        color,
        icon,
        imageUploadId,
        sortOrder,
        isFourPlusOneEligible,
        isCashbackEligible,
      } =
        normalizeProductCategoryInput(input);

      if (parentId) {
        await fastify.admin.productCategories.get(parentId);
      }

      const imageUpload = imageUploadId
        ? await fastify.db.query.uploadsDB.findFirst({
            columns: {
              id: true,
              mimeType: true,
            },
            where(uploadTable, { eq }) {
              return eq(uploadTable.id, imageUploadId);
            },
          })
        : null;

      if (imageUploadId && !imageUpload) {
        throw notFound("upload.notFound", "The image upload was not found");
      }

      if (imageUpload && !imageUpload.mimeType.toLowerCase().startsWith("image/")) {
        throw badRequest(
          "productCategory.invalidImageUpload",
          "The selected upload must be an image file",
        );
      }

      try {
        const [createdCategory] = await fastify.db
          .insert(productCategoriesDB)
          .values({
            id: generateNanoId(),
            name,
            icon,
            color,
            sortOrder,
            isFourPlusOneEligible,
            isCashbackEligible,
            imageUploadId: imageUpload?.id ?? null,
            parentId,
          })
          .returning();

        if (!createdCategory) {
          throw new Error("Failed to create product category");
        }

        const category = await fastify.admin.productCategories.get(createdCategory.id);

        if (!category) {
          throw new Error("Failed to retrieve created product category");
        }

        return category;
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

    async update(id, input) {
      const existingCategory = await fastify.admin.productCategories.get(id);
      if (!existingCategory) {
        throw notFound("productCategory.notFound", "The product category was not found");
      }

      const normalizedInput = normalizeProductCategoryUpdateInput(input);

      if (normalizedInput.parentId && normalizedInput.parentId === id) {
        throw badRequest(
          "productCategory.invalidParent",
          "A category cannot be assigned as its own parent",
        );
      }

      if (normalizedInput.parentId) {
        await fastify.admin.productCategories.get(normalizedInput.parentId);
      }

      const imageUpload =
        "imageUploadId" in normalizedInput && normalizedInput.imageUploadId
          ? await fastify.db.query.uploadsDB.findFirst({
              columns: {
                id: true,
                mimeType: true,
              },
              where(uploadTable, { eq }) {
                return eq(uploadTable.id, normalizedInput.imageUploadId as string);
              },
            })
          : null;

      if ("imageUploadId" in normalizedInput && normalizedInput.imageUploadId && !imageUpload) {
        throw notFound("upload.notFound", "The image upload was not found");
      }

      if (imageUpload && !imageUpload.mimeType.toLowerCase().startsWith("image/")) {
        throw badRequest(
          "productCategory.invalidImageUpload",
          "The selected upload must be an image file",
        );
      }

      try {
        const [updatedCategory] = await fastify.db
          .update(productCategoriesDB)
          .set({
            ...normalizedInput,
            updatedAt: sql`now()`,
          })
          .where(sql`${productCategoriesDB.id} = ${id}`)
          .returning({
            id: productCategoriesDB.id,
          });

        if (!updatedCategory) {
          throw notFound("productCategory.notFound", "The product category was not found");
        }

        const category = await fastify.admin.productCategories.get(updatedCategory.id);

        if (!category) {
          throw new Error("Failed to retrieve updated product category");
        }

        return category;
      } catch (error) {
        const pgError = getPgError(error);

        if (
          pgError?.code === "23505" &&
          (pgError.constraint === "product_category_parent_name_unique" ||
            pgError.constraint === "product_category_root_name_unique")
        ) {
          throw conflict(
            "productCategory.duplicatedName",
            normalizedInput.parentId ?? existingCategory.parentId
              ? "A category with this name already exists under the selected parent"
              : "A root category with this name already exists",
          );
        }

        throw error;
      }
    },
  };
}
