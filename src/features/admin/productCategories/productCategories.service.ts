import {
  couponCategoryRulesDB,
  productCategoriesDB,
  productCategoryLinksDB,
  productsDB,
} from "@core/db/schemas";
import {
  badRequest,
  buildFuzzySearch,
  conflict,
  generateNanoId,
  getPgError,
  notFound,
  paginate,
} from "@core/utils";
import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
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
        isFourPlusOneEligible,
        isCashbackEligible,
      } = normalizeProductCategoryInput(input);

      if (parentId) {
        await fastify.admin.productCategories.get(parentId);
      }

      if (!imageUploadId) {
        throw badRequest("productCategory.imageRequired", "The product category requires an image");
      }

      const [nextSortOrderRow] =
        input.sortOrder === undefined
          ? await fastify.db
              .select({
                nextSortOrder: sql<number>`coalesce(max(${productCategoriesDB.sortOrder}), -1) + 1`,
              })
              .from(productCategoriesDB)
              .where(
                parentId
                  ? eq(productCategoriesDB.parentId, parentId)
                  : isNull(productCategoriesDB.parentId),
              )
          : [];
      const resolvedSortOrder = input.sortOrder ?? nextSortOrderRow?.nextSortOrder ?? 0;

      const imageUpload = await fastify.db.query.uploadsDB.findFirst({
        columns: {
          id: true,
          mimeType: true,
        },
        where(uploadTable, { eq }) {
          return eq(uploadTable.id, imageUploadId);
        },
      });

      if (!imageUpload) {
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
            sortOrder: resolvedSortOrder,
            isFourPlusOneEligible,
            isCashbackEligible,
            imageUploadId: imageUpload.id,
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

      if (input.imageUploadId === undefined && !existingCategory.image) {
        throw badRequest("productCategory.imageRequired", "The product category requires an image");
      }

      if (normalizedInput.parentId && normalizedInput.parentId === id) {
        throw badRequest(
          "productCategory.invalidParent",
          "A category cannot be assigned as its own parent",
        );
      }

      if (normalizedInput.parentId) {
        await fastify.admin.productCategories.get(normalizedInput.parentId);

        const descendants = await getDescendantTreeRows(fastify.db, [id]);

        if (descendants.some((category) => category.id === normalizedInput.parentId)) {
          throw badRequest(
            "productCategory.invalidParent",
            "A category cannot be assigned under one of its descendants",
          );
        }
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

      const parentChanged =
        "parentId" in normalizedInput && normalizedInput.parentId !== existingCategory.parentId;
      const [nextSortOrderRow] = parentChanged
        ? await fastify.db
            .select({
              nextSortOrder: sql<number>`coalesce(max(${productCategoriesDB.sortOrder}), -1) + 1`,
            })
            .from(productCategoriesDB)
            .where(
              normalizedInput.parentId
                ? eq(productCategoriesDB.parentId, normalizedInput.parentId)
                : isNull(productCategoriesDB.parentId),
            )
        : [];

      try {
        const [updatedCategory] = await fastify.db
          .update(productCategoriesDB)
          .set({
            ...normalizedInput,
            ...(parentChanged && { sortOrder: nextSortOrderRow?.nextSortOrder ?? 0 }),
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
            ("parentId" in normalizedInput ? normalizedInput.parentId : existingCategory.parentId)
              ? "A category with this name already exists under the selected parent"
              : "A root category with this name already exists",
          );
        }

        throw error;
      }
    },

    async reorder(id, direction) {
      const category = await fastify.admin.productCategories.get(id);

      if (!category) {
        throw notFound("productCategory.notFound", "The product category was not found");
      }

      await fastify.db.transaction(async (tx) => {
        const siblings = await tx
          .select({
            id: productCategoriesDB.id,
            sortOrder: productCategoriesDB.sortOrder,
            name: productCategoriesDB.name,
          })
          .from(productCategoriesDB)
          .where(
            category.parentId
              ? eq(productCategoriesDB.parentId, category.parentId)
              : isNull(productCategoriesDB.parentId),
          )
          .orderBy(
            asc(productCategoriesDB.sortOrder),
            asc(productCategoriesDB.name),
            asc(productCategoriesDB.id),
          );
        const currentIndex = siblings.findIndex((sibling) => sibling.id === id);

        if (currentIndex < 0) {
          throw notFound("productCategory.notFound", "The product category was not found");
        }

        const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
        const reordered = [...siblings];

        if (targetIndex >= 0 && targetIndex < reordered.length) {
          const current = reordered[currentIndex];
          const target = reordered[targetIndex];

          if (current && target) {
            reordered[currentIndex] = target;
            reordered[targetIndex] = current;
          }
        }

        for (const [index, sibling] of reordered.entries()) {
          await tx
            .update(productCategoriesDB)
            .set({ sortOrder: index, updatedAt: sql`now()` })
            .where(eq(productCategoriesDB.id, sibling.id));
        }
      });
    },

    async remove(id) {
      await fastify.db.transaction(async (tx) => {
        const [category] = await tx
          .select({ id: productCategoriesDB.id })
          .from(productCategoriesDB)
          .where(eq(productCategoriesDB.id, id));

        if (!category) {
          throw notFound("productCategory.notFound", "The product category was not found");
        }

        const [children, legacyProducts, linkedProducts, couponRules] = await Promise.all([
          tx
            .select({ id: productCategoriesDB.id })
            .from(productCategoriesDB)
            .where(eq(productCategoriesDB.parentId, id)),
          tx.select({ id: productsDB.id }).from(productsDB).where(eq(productsDB.categoryId, id)),
          tx
            .select({ id: productCategoryLinksDB.productId })
            .from(productCategoryLinksDB)
            .where(eq(productCategoryLinksDB.categoryId, id)),
          tx
            .select({ couponId: couponCategoryRulesDB.couponId })
            .from(couponCategoryRulesDB)
            .where(eq(couponCategoryRulesDB.categoryId, id)),
        ]);
        const productIds = new Set([
          ...legacyProducts.map((product) => product.id),
          ...linkedProducts.map((product) => product.id),
        ]);
        const dependencies = {
          children: children.length,
          products: productIds.size,
          couponRules: couponRules.length,
        };

        if (dependencies.children || dependencies.products || dependencies.couponRules) {
          throw conflict(
            "productCategory.inUse",
            "The product category cannot be deleted while it has dependencies",
            dependencies,
          );
        }

        await tx.delete(productCategoriesDB).where(eq(productCategoriesDB.id, id));
      });
    },
  };
}
