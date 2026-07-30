import {
  organizationProductDB,
  productCategoriesDB,
  productCategoryLinksDB,
  productCompoundComponentsDB,
  productCompoundSlotOptionsDB,
  productCompoundSlotsDB,
  productModifierOptionsDB,
  productModifierVisibilityRulesDB,
  productModifiersDB,
  productsDB,
  productTaxDB,
  productVariationGroupsDB,
  recipeIngredientsDB,
  recipesDB,
  recipeSuppliesDB,
  taxDB,
  variationRecipeIngredientsDB,
  variationRecipesDB,
  variationRecipeSuppliesDB,
  variationsDB,
  variationSelectionsDB,
  uploadsDB,
} from "@core/db/schemas";
import {
  badRequest,
  buildFuzzySearch,
  conflict,
  generateNanoId,
  getPgError,
  notFound,
  normalizeString,
  paginate,
} from "@core/utils";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  buildProductModifierInsertPayloads,
  buildProductModifierOptionInsertPayloads,
  buildProductModifierVisibilityRuleInsertPayloads,
  buildProductCompoundComponentInsertPayloads,
  buildProductVariationInsertPayloads,
  normalizeProductInput,
  normalizeProductVariationsInput,
} from "./products.helpers";
import { mapProductResponse, sortVariationGroupResponse } from "./products.mappers";
import type {
  AdminProductsService,
  ProductListCategory,
  ProductOrganizationStatus,
} from "./products.types";
import {
  validateProductBasePrice,
  validateProductCompoundComponents,
  validateProductModifierConfigs,
  validateProductOrganizations,
  validateProductRecipe,
  validateProductVariations,
} from "./products.validators";

async function getProductVariationGroupsForValidation(fastify: FastifyInstance, productId: string) {
  const variationGroupLinks = await fastify.db.query.productVariationGroupsDB.findMany({
    where(table, { eq }) {
      return eq(table.productId, productId);
    },
    with: {
      group: {
        with: {
          options: {
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
          },
        },
      },
    },
  });

  return variationGroupLinks.map(({ group }) => sortVariationGroupResponse(group));
}

export function collectCategoryAndDescendantIds(
  categories: Array<{ id: string; parentId: string | null }>,
  categoryId: string,
): string[] {
  const selectedIds = new Set([categoryId]);
  let addedCategory = true;

  while (addedCategory) {
    addedCategory = false;

    for (const category of categories) {
      if (
        category.parentId &&
        selectedIds.has(category.parentId) &&
        !selectedIds.has(category.id)
      ) {
        selectedIds.add(category.id);
        addedCategory = true;
      }
    }
  }

  return [...selectedIds];
}

function addProductCategory(
  categoriesByProduct: Map<string, ProductListCategory[]>,
  productId: string,
  category: ProductListCategory,
) {
  const categories = categoriesByProduct.get(productId) ?? [];

  if (!categories.some((currentCategory) => currentCategory.id === category.id)) {
    categories.push(category);
    categoriesByProduct.set(productId, categories);
  }
}

export function adminProductsService(fastify: FastifyInstance): AdminProductsService {
  return {
    async get(id, { safe = false } = {}) {
      const [
        product,
        recipe,
        productVariationGroups,
        variations,
        productModifiers,
        compoundComponents,
      ] = await Promise.all([
        fastify.db.query.productsDB.findFirst({
          where(productTable, { eq }) {
            return eq(productTable.id, id);
          },
          columns: {
            unitId: false,
            categoryId: false,
            imageUploadId: false,
          },
          with: {
            unit: true,
            image: {
              columns: {
                id: true,
                name: true,
                path: true,
                visibility: true,
                mimeType: true,
              },
            },
            category: {
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
            },
            categories: {
              columns: {
                productId: false,
                categoryId: false,
                createdAt: false,
                updatedAt: false,
              },
              with: {
                category: {
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
                },
              },
            },
            taxes: {
              with: {
                tax: true,
              },
            },
            organizations: {
              with: {
                organization: true,
              },
            },
          },
        }),
        fastify.db.query.recipesDB.findFirst({
          where(recipeTable, { eq }) {
            return eq(recipeTable.productId, id);
          },
          columns: {
            productId: false,
          },
          with: {
            ingredients: {
              columns: {
                recipeId: false,
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
                recipeId: false,
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
        }),
        fastify.db.query.productVariationGroupsDB.findMany({
          where(table, { eq }) {
            return eq(table.productId, id);
          },
          with: {
            group: {
              with: {
                options: {
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
                },
              },
            },
          },
        }),
        fastify.db.query.variationsDB.findMany({
          where(table, { and, eq, isNull }) {
            return and(eq(table.productId, id), isNull(table.deletedAt));
          },
          columns: {
            productId: false,
            combinationKey: false,
          },
          with: {
            selections: {
              columns: {
                variationId: false,
                variationGroupId: false,
                variationOptionId: false,
              },
              with: {
                group: true,
                option: {
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
                },
              },
            },
            recipe: {
              columns: {
                variationId: false,
              },
              with: {
                ingredients: {
                  columns: {
                    variationId: false,
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
                    variationId: false,
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
        }),
        fastify.db.query.productModifiersDB.findMany({
          where(table, { eq }) {
            return eq(table.productId, id);
          },
          with: {
            allowedOptions: {
              columns: {
                productId: false,
                modifierId: false,
                modifierOptionId: true,
                createdAt: false,
                updatedAt: false,
              },
            },
            visibilityRules: {
              columns: {
                productId: false,
                modifierId: false,
                variationGroupId: true,
                variationOptionId: true,
                createdAt: false,
                updatedAt: false,
              },
            },
            modifier: {
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
            },
          },
        }),
        fastify.db.query.productCompoundComponentsDB.findMany({
          where(table, { eq }) {
            return eq(table.compoundProductId, id);
          },
          with: {
            componentProduct: {
              columns: {
                id: true,
                name: true,
                kitchenName: true,
                priceCents: true,
                productType: true,
                customerDescription: true,
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
            },
          },
        }),
      ]);

      if (!product && !safe) {
        throw notFound("product.notFound", "The product was not found");
      }

      if (!product) {
        return null;
      }

      return mapProductResponse({
        ...product,
        recipe: recipe ?? null,
        variationGroups: productVariationGroups,
        variations,
        modifiers: productModifiers,
        compoundComponents,
      });
    },

    async getGeneral(id, organizationId) {
      const product = await fastify.db.query.productsDB.findFirst({
        where(table, { and, eq: eqOperator, isNull: isNullOperator }) {
          return and(eqOperator(table.id, id), isNullOperator(table.deletedAt));
        },
        columns: {
          categoryId: false,
          imageUploadId: false,
          priceCents: false,
          unitId: false,
          createdAt: false,
          deletedAt: false,
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
          unit: {
            columns: {
              id: true,
              name: true,
              abbreviation: true,
              precision: true,
            },
          },
          categories: {
            columns: {
              productId: false,
              categoryId: false,
              createdAt: false,
              updatedAt: false,
            },
            with: {
              category: {
                columns: {
                  id: true,
                  name: true,
                  color: true,
                },
              },
            },
          },
          taxes: {
            columns: {
              productId: false,
              taxId: false,
              createdAt: false,
              updatedAt: false,
            },
            with: {
              tax: {
                columns: {
                  id: true,
                  name: true,
                  rate: true,
                },
              },
            },
          },
        },
      });

      if (!product) {
        throw notFound("product.notFound", "The product was not found");
      }

      const [configuredSlots, legacyComponents] =
        product.productType === "compound"
          ? await Promise.all([
              fastify.db.query.productCompoundSlotsDB.findMany({
                where(table, { eq: eqOperator }) {
                  return eqOperator(table.compoundProductId, id);
                },
                columns: {
                  id: true,
                  label: true,
                  quantity: true,
                  sortOrder: true,
                },
                with: {
                  options: {
                    columns: {
                      label: true,
                      sortOrder: true,
                    },
                    with: {
                      componentProduct: {
                        columns: {
                          id: true,
                          name: true,
                          kitchenName: true,
                          productType: true,
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
                          organizations: {
                            columns: {
                              organizationId: true,
                              isActive: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              }),
              fastify.db.query.productCompoundComponentsDB.findMany({
                where(table, { eq: eqOperator }) {
                  return eqOperator(table.compoundProductId, id);
                },
                columns: {
                  label: true,
                  quantity: true,
                  sortOrder: true,
                },
                with: {
                  componentProduct: {
                    columns: {
                      id: true,
                      name: true,
                      kitchenName: true,
                      productType: true,
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
                      organizations: {
                        columns: {
                          organizationId: true,
                          isActive: true,
                        },
                      },
                    },
                  },
                },
              }),
            ])
          : [[], []];
      const getOrganizationStatus = (
        organizations: Array<{ organizationId: string; isActive: boolean }>,
      ): ProductOrganizationStatus => {
        const assignment = organizations.find(
          (organization) => organization.organizationId === organizationId,
        );

        return assignment ? (assignment.isActive ? "active" : "inactive") : "unassigned";
      };
      const mapComponentProduct = (componentProduct: {
        id: string;
        name: string;
        kitchenName: string | null;
        productType: "simple" | "assembled" | "compound";
        image: {
          id: string;
          name: string;
          path: string;
          visibility: "PUBLIC" | "PRIVATE";
          mimeType: string;
        } | null;
        organizations: Array<{ organizationId: string; isActive: boolean }>;
      }) => ({
        id: componentProduct.id,
        name: componentProduct.name,
        kitchenName: componentProduct.kitchenName,
        productType: componentProduct.productType as "simple" | "assembled",
        image: componentProduct.image,
        organizationStatus: getOrganizationStatus(componentProduct.organizations),
      });
      const compoundSlots =
        configuredSlots.length > 0
          ? configuredSlots
              .map((slot) => ({
                label: slot.label,
                quantity: slot.quantity,
                sortOrder: slot.sortOrder,
                options: slot.options
                  .map((option) => ({
                    label: option.label,
                    sortOrder: option.sortOrder,
                    product: mapComponentProduct(option.componentProduct),
                  }))
                  .sort((left, right) => left.sortOrder - right.sortOrder),
              }))
              .sort((left, right) => left.sortOrder - right.sortOrder)
          : legacyComponents
              .map((component) => ({
                label: component.label ?? `Componente ${component.sortOrder + 1}`,
                quantity: component.quantity,
                sortOrder: component.sortOrder,
                options: [
                  {
                    label: component.label,
                    sortOrder: 0,
                    product: mapComponentProduct(component.componentProduct),
                  },
                ],
              }))
              .sort((left, right) => left.sortOrder - right.sortOrder);

      return {
        id: product.id,
        name: product.name,
        kitchenName: product.kitchenName,
        customerDescription: product.customerDescription,
        kitchenDescription: product.kitchenDescription,
        isFeatured: product.isFeatured,
        productType: product.productType,
        updatedAt: product.updatedAt!,
        image: product.image,
        unit: product.unit,
        categories: product.categories
          .map(({ category }) => category)
          .sort((left, right) => left.name.localeCompare(right.name)),
        taxes: product.taxes
          .map(({ tax }) => tax)
          .sort((left, right) => left.name.localeCompare(right.name)),
        compoundSlots,
      };
    },

    async list({
      organizationId,
      search,
      page,
      pageSize,
      categoryId,
      productType,
      organizationStatus,
      sortBy,
      sortDirection,
    }) {
      const fuzzySearch = buildFuzzySearch({
        query: search,
        values: [
          productsDB.name,
          productsDB.kitchenName,
          productsDB.customerDescription,
          productsDB.kitchenDescription,
        ],
      });

      const categoryIds = categoryId
        ? collectCategoryAndDescendantIds(
            await fastify.db
              .select({ id: productCategoriesDB.id, parentId: productCategoriesDB.parentId })
              .from(productCategoriesDB),
            categoryId,
          )
        : null;
      const variationPrices = fastify.db
        .select({
          productId: variationsDB.productId,
          minPriceCents: sql<number | null>`cast(min(${variationsDB.priceCents}) as int)`.as(
            "min_price_cents",
          ),
          maxPriceCents: sql<number | null>`cast(max(${variationsDB.priceCents}) as int)`.as(
            "max_price_cents",
          ),
        })
        .from(variationsDB)
        .where(isNull(variationsDB.deletedAt))
        .groupBy(variationsDB.productId)
        .as("active_variation_prices");
      const minPriceExpression = sql<number | null>`coalesce(
        ${productsDB.priceCents},
        ${variationPrices.minPriceCents}
      )`;
      const maxPriceExpression = sql<number | null>`coalesce(
        ${productsDB.priceCents},
        ${variationPrices.maxPriceCents}
      )`;
      const organizationStatusExpression = sql<ProductOrganizationStatus>`case
        when ${organizationProductDB.productId} is null then 'unassigned'
        when ${organizationProductDB.isActive} = true then 'active'
        else 'inactive'
      end`;
      const whereConditions: SQL[] = [isNull(productsDB.deletedAt)];

      if (fuzzySearch.where) {
        whereConditions.push(fuzzySearch.where);
      }

      if (productType) {
        whereConditions.push(eq(productsDB.productType, productType));
      }

      if (categoryIds) {
        const categoryCondition = or(
          inArray(productsDB.categoryId, categoryIds),
          sql`exists (
            select 1
            from ${productCategoryLinksDB}
            where ${productCategoryLinksDB.productId} = ${productsDB.id}
              and ${inArray(productCategoryLinksDB.categoryId, categoryIds)}
          )`,
        );

        if (categoryCondition) {
          whereConditions.push(categoryCondition);
        }
      }

      if (organizationStatus === "active") {
        whereConditions.push(eq(organizationProductDB.isActive, true));
      } else if (organizationStatus === "inactive") {
        whereConditions.push(eq(organizationProductDB.isActive, false));
      } else if (organizationStatus === "unassigned") {
        whereConditions.push(isNull(organizationProductDB.productId));
      }

      const sortExpression =
        sortBy === "price"
          ? minPriceExpression
          : sortBy === "productType"
            ? sql`${productsDB.productType}`
            : sortBy === "updatedAt"
              ? sql`${productsDB.updatedAt}`
              : sql`${productsDB.name}`;
      const orderBy: [SQL, ...SQL[]] = [
        sortDirection === "desc" ? desc(sortExpression) : asc(sortExpression),
        asc(productsDB.id),
      ];

      const paginatedProducts = await paginate({
        executor: fastify.db,
        createQuery: () => {
          const query = fastify.db
            .select({
              id: productsDB.id,
              name: productsDB.name,
              kitchenName: productsDB.kitchenName,
              productType: productsDB.productType,
              isFeatured: productsDB.isFeatured,
              updatedAt: productsDB.updatedAt,
              legacyCategoryId: productsDB.categoryId,
              imageId: uploadsDB.id,
              imageName: uploadsDB.name,
              imagePath: uploadsDB.path,
              imageVisibility: uploadsDB.visibility,
              imageMimeType: uploadsDB.mimeType,
              minPriceCents: minPriceExpression,
              maxPriceCents: maxPriceExpression,
              organizationStatus: organizationStatusExpression,
            })
            .from(productsDB)
            .leftJoin(uploadsDB, eq(uploadsDB.id, productsDB.imageUploadId))
            .leftJoin(
              organizationProductDB,
              and(
                eq(organizationProductDB.productId, productsDB.id),
                eq(organizationProductDB.organizationId, organizationId),
              ),
            )
            .leftJoin(variationPrices, eq(variationPrices.productId, productsDB.id))
            .$dynamic();

          query.where(and(...whereConditions));

          return query;
        },
        orderBy,
        page,
        pageSize,
      });

      if (paginatedProducts.data.length === 0) {
        return {
          data: [],
          pagination: paginatedProducts.pagination,
        };
      }

      const productIds = paginatedProducts.data.map((product) => product.id);
      const legacyCategoryIds = paginatedProducts.data
        .map((product) => product.legacyCategoryId)
        .filter((id): id is string => Boolean(id));
      const [linkedCategories, legacyCategories] = await Promise.all([
        fastify.db
          .select({
            productId: productCategoryLinksDB.productId,
            id: productCategoriesDB.id,
            name: productCategoriesDB.name,
            color: productCategoriesDB.color,
          })
          .from(productCategoryLinksDB)
          .innerJoin(
            productCategoriesDB,
            eq(productCategoriesDB.id, productCategoryLinksDB.categoryId),
          )
          .where(inArray(productCategoryLinksDB.productId, productIds)),
        legacyCategoryIds.length > 0
          ? fastify.db
              .select({
                id: productCategoriesDB.id,
                name: productCategoriesDB.name,
                color: productCategoriesDB.color,
              })
              .from(productCategoriesDB)
              .where(inArray(productCategoriesDB.id, legacyCategoryIds))
          : Promise.resolve([]),
      ]);
      const categoriesByProduct = new Map<string, ProductListCategory[]>();
      const legacyCategoriesById = new Map(
        legacyCategories.map((category) => [category.id, category]),
      );

      for (const category of linkedCategories) {
        addProductCategory(categoriesByProduct, category.productId, category);
      }

      for (const product of paginatedProducts.data) {
        if (!product.legacyCategoryId) {
          continue;
        }

        const category = legacyCategoriesById.get(product.legacyCategoryId);

        if (category) {
          addProductCategory(categoriesByProduct, product.id, category);
        }
      }

      return {
        data: paginatedProducts.data.map((product) => ({
          id: product.id,
          name: product.name,
          kitchenName: product.kitchenName,
          productType: product.productType,
          isFeatured: product.isFeatured,
          updatedAt: product.updatedAt!,
          image: product.imageId
            ? {
                id: product.imageId,
                name: product.imageName ?? "",
                path: product.imagePath ?? "",
                visibility: product.imageVisibility ?? "PUBLIC",
                mimeType: product.imageMimeType ?? "application/octet-stream",
              }
            : null,
          categories: (categoriesByProduct.get(product.id) ?? []).sort((left, right) =>
            left.name.localeCompare(right.name),
          ),
          minPriceCents: product.minPriceCents,
          maxPriceCents: product.maxPriceCents,
          organizationStatus: product.organizationStatus,
        })),
        pagination: paginatedProducts.pagination,
      };
    },

    async listCompoundOptions(productId, { organizationId, page, pageSize, search }) {
      const compoundProduct = await fastify.db.query.productsDB.findFirst({
        where(table, { and: andOperator, eq: eqOperator, isNull: isNullOperator }) {
          return andOperator(eqOperator(table.id, productId), isNullOperator(table.deletedAt));
        },
        columns: {
          id: true,
          productType: true,
        },
      });

      if (!compoundProduct) {
        throw notFound("product.notFound", "The product was not found");
      }

      if (compoundProduct.productType !== "compound") {
        throw badRequest(
          "product.compoundOptionsNotAllowed",
          "Compound options can only be listed for compound products",
        );
      }

      const fuzzySearch = buildFuzzySearch({
        query: search,
        values: [productsDB.name, productsDB.kitchenName],
      });
      const organizationStatusExpression = sql<ProductOrganizationStatus>`case
        when ${organizationProductDB.productId} is null then 'unassigned'
        when ${organizationProductDB.isActive} = true then 'active'
        else 'inactive'
      end`;
      const whereConditions: SQL[] = [
        isNull(productsDB.deletedAt),
        ne(productsDB.id, productId),
        inArray(productsDB.productType, ["simple", "assembled"]),
      ];

      if (fuzzySearch.where) {
        whereConditions.push(fuzzySearch.where);
      }

      const paginatedOptions = await paginate({
        executor: fastify.db,
        createQuery: () => {
          const query = fastify.db
            .select({
              id: productsDB.id,
              name: productsDB.name,
              kitchenName: productsDB.kitchenName,
              productType: productsDB.productType,
              imageId: uploadsDB.id,
              imageName: uploadsDB.name,
              imagePath: uploadsDB.path,
              imageVisibility: uploadsDB.visibility,
              imageMimeType: uploadsDB.mimeType,
              organizationStatus: organizationStatusExpression,
            })
            .from(productsDB)
            .leftJoin(uploadsDB, eq(uploadsDB.id, productsDB.imageUploadId))
            .leftJoin(
              organizationProductDB,
              and(
                eq(organizationProductDB.productId, productsDB.id),
                eq(organizationProductDB.organizationId, organizationId),
              ),
            )
            .$dynamic();

          query.where(and(...whereConditions));

          return query;
        },
        orderBy: [asc(productsDB.name), asc(productsDB.id)],
        page,
        pageSize,
      });

      return {
        data: paginatedOptions.data.map((option) => ({
          id: option.id,
          name: option.name,
          kitchenName: option.kitchenName,
          productType: option.productType as "simple" | "assembled",
          image: option.imageId
            ? {
                id: option.imageId,
                name: option.imageName ?? "",
                path: option.imagePath ?? "",
                visibility: option.imageVisibility ?? "PUBLIC",
                mimeType: option.imageMimeType ?? "application/octet-stream",
              }
            : null,
          organizationStatus: option.organizationStatus,
        })),
        pagination: paginatedOptions.pagination,
      };
    },

    async create(input) {
      const {
        name,
        kitchenName,
        priceCents,
        customerDescription,
        kitchenDescription,
        unitId,
        productType,
        categoryId,
        categoryIds,
        imageUploadId,
        isFeatured,
        recipe,
        taxIds,
        organizationIds,
        modifierConfigs,
        variationGroupIds,
        variations,
        compoundComponents,
      } = normalizeProductInput(input);

      try {
        await fastify.admin.units.get(unitId);

        if (categoryIds.length > 0) {
          await Promise.all(categoryIds.map((id) => fastify.admin.productCategories.get(id)));
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
            "product.invalidImageUpload",
            "The selected upload must be an image file",
          );
        }

        if (taxIds.length > 0) {
          const taxes = await fastify.db.query.taxDB.findMany({
            where(table, { inArray }) {
              return inArray(table.id, taxIds);
            },
            columns: {
              id: true,
            },
          });

          if (taxes.length !== taxIds.length) {
            throw notFound("tax.notFound", "One or more taxes were not found");
          }
        }

        const [
          validatedRecipe,
          validatedVariationConfig,
          validatedOrganizationIds,
          validatedCompoundComponents,
        ] = await Promise.all([
          validateProductRecipe(fastify, productType, variations.length > 0, recipe),
          validateProductVariations(fastify, productType, variationGroupIds, variations),
          validateProductOrganizations(fastify, organizationIds),
          validateProductCompoundComponents(fastify, productType, compoundComponents),
        ]);
        const validatedModifierConfigs = await validateProductModifierConfigs(
          fastify,
          modifierConfigs,
          { variationGroups: validatedVariationConfig.variationGroups },
        );
        const validatedPriceCents = validateProductBasePrice(
          priceCents,
          validatedVariationConfig.variations.length,
        );

        if (
          productType === "compound" &&
          (validatedVariationConfig.variations.length > 0 ||
            validatedVariationConfig.variationGroups.length > 0 ||
            validatedModifierConfigs.length > 0)
        ) {
          throw badRequest(
            "product.compoundParentConfigurationNotAllowed",
            "Compound product parent cannot include variations or modifiers",
          );
        }

        const createdProductId = await fastify.db.transaction(async (tx) => {
          const [createdProduct] = await tx
            .insert(productsDB)
            .values({
              id: generateNanoId(),
              name,
              kitchenName,
              priceCents: validatedPriceCents,
              customerDescription,
              kitchenDescription,
              unitId,
              productType,
              categoryId,
              isFeatured,
              imageUploadId: imageUpload?.id ?? null,
            })
            .returning();

          if (!createdProduct) {
            throw new Error("Failed to create product");
          }

          if (categoryIds.length > 0) {
            await tx.insert(productCategoryLinksDB).values(
              categoryIds.map((id) => ({
                productId: createdProduct.id,
                categoryId: id,
              })),
            );
          }

          if (taxIds.length > 0) {
            await tx.insert(productTaxDB).values(
              taxIds.map((taxId) => ({
                productId: createdProduct.id,
                taxId,
              })),
            );
          }

          if (validatedCompoundComponents.length > 0) {
            await tx
              .insert(productCompoundComponentsDB)
              .values(
                buildProductCompoundComponentInsertPayloads(
                  createdProduct.id,
                  validatedCompoundComponents,
                ),
              );
          }

          await tx.insert(organizationProductDB).values(
            validatedOrganizationIds.map((organizationId) => ({
              productId: createdProduct.id,
              organizationId,
              isActive: true,
            })),
          );

          const productModifierPayloads = buildProductModifierInsertPayloads(
            createdProduct.id,
            validatedModifierConfigs,
            0,
          );

          if (productModifierPayloads.length > 0) {
            await tx.insert(productModifiersDB).values(productModifierPayloads);
          }

          const productModifierOptionPayloads = buildProductModifierOptionInsertPayloads(
            createdProduct.id,
            validatedModifierConfigs,
          );

          if (productModifierOptionPayloads.length > 0) {
            await tx.insert(productModifierOptionsDB).values(productModifierOptionPayloads);
          }

          if (validatedVariationConfig.variationGroups.length > 0) {
            await tx.insert(productVariationGroupsDB).values(
              validatedVariationConfig.variationGroups.map((variationGroup, index) => ({
                productId: createdProduct.id,
                variationGroupId: variationGroup.id,
                sortOrder: index,
              })),
            );
          }

          const productModifierVisibilityRulePayloads =
            buildProductModifierVisibilityRuleInsertPayloads(
              createdProduct.id,
              validatedModifierConfigs,
            );

          if (productModifierVisibilityRulePayloads.length > 0) {
            await tx
              .insert(productModifierVisibilityRulesDB)
              .values(productModifierVisibilityRulePayloads);
          }

          if (validatedRecipe) {
            await tx.insert(recipesDB).values({
              productId: createdProduct.id,
              description: validatedRecipe.description,
            });

            if (validatedRecipe.ingredients.length > 0) {
              await tx.insert(recipeIngredientsDB).values(
                validatedRecipe.ingredients.map(({ ingredientId, quantity }) => ({
                  recipeId: createdProduct.id,
                  ingredientId,
                  quantity,
                })),
              );
            }

            if (validatedRecipe.supplies.length > 0) {
              await tx.insert(recipeSuppliesDB).values(
                validatedRecipe.supplies.map(({ supplyId, quantity }) => ({
                  recipeId: createdProduct.id,
                  supplyId,
                  quantity,
                })),
              );
            }
          }

          const variationInsertPayloads = buildProductVariationInsertPayloads(
            createdProduct.id,
            validatedVariationConfig.variations,
            0,
          );

          if (variationInsertPayloads.createdVariations.length > 0) {
            await tx.insert(variationsDB).values(variationInsertPayloads.createdVariations);
          }

          if (variationInsertPayloads.variationSelections.length > 0) {
            await tx
              .insert(variationSelectionsDB)
              .values(variationInsertPayloads.variationSelections);
          }

          if (variationInsertPayloads.variationRecipes.length > 0) {
            await tx.insert(variationRecipesDB).values(
              variationInsertPayloads.variationRecipes.map(
                ({ variationId, recipe: variationRecipe }) => ({
                  variationId,
                  description: variationRecipe?.description ?? null,
                }),
              ),
            );
          }

          if (variationInsertPayloads.variationRecipeIngredients.length > 0) {
            await tx
              .insert(variationRecipeIngredientsDB)
              .values(variationInsertPayloads.variationRecipeIngredients);
          }

          if (variationInsertPayloads.variationRecipeSupplies.length > 0) {
            await tx
              .insert(variationRecipeSuppliesDB)
              .values(variationInsertPayloads.variationRecipeSupplies);
          }

          return createdProduct.id;
        });

        const product = await fastify.admin.products.get(createdProductId);

        if (!product) {
          throw new Error("Failed to retrieve created product");
        }

        return product;
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505" && pgError.constraint === "product_name_active_unique") {
          throw conflict("product.duplicatedName", "A product with this name already exists");
        }

        if (
          pgError?.code === "23505" &&
          pgError.constraint === "variation_product_combination_key_active_unique"
        ) {
          throw conflict(
            "productVariation.duplicatedCombination",
            "A variation with this combination already exists for the product",
          );
        }

        throw error;
      }
    },

    async updateGeneral(id, organizationId, input) {
      const existingProduct = await fastify.db.query.productsDB.findFirst({
        where(table, { and, eq: eqOperator, isNull: isNullOperator }) {
          return and(eqOperator(table.id, id), isNullOperator(table.deletedAt));
        },
        columns: { id: true, productType: true },
      });

      if (!existingProduct) {
        throw notFound("product.notFound", "The product was not found");
      }

      const categoryIds =
        input.categoryIds === undefined ? undefined : [...new Set(input.categoryIds)];
      const taxIds = input.taxIds === undefined ? undefined : [...new Set(input.taxIds)];
      const imageUploadId = input.imageUploadId;
      const normalizeOptionalText = (value: string | null | undefined) => {
        if (value === undefined || value === null) {
          return value;
        }

        const normalized = normalizeString(value, {
          trim: true,
          collapseWhitespace: true,
        });

        return normalized.length > 0 ? normalized : null;
      };
      const name =
        input.name === undefined
          ? undefined
          : normalizeString(input.name, {
              trim: true,
              collapseWhitespace: true,
            });
      const compoundSlots = input.compoundSlots?.map((slot) => ({
        label: normalizeString(slot.label, { trim: true, collapseWhitespace: true }),
        quantity: slot.quantity,
        sortOrder: slot.sortOrder,
        options: slot.options.map((option) => ({
          productId: option.productId,
          label:
            option.label === null
              ? null
              : normalizeString(option.label, { trim: true, collapseWhitespace: true }),
          sortOrder: option.sortOrder,
        })),
      }));

      if (compoundSlots !== undefined) {
        if (existingProduct.productType !== "compound") {
          throw badRequest(
            "product.compoundSlotsNotAllowed",
            "Only compound products can include compound slots",
          );
        }

        if (compoundSlots.length < 2) {
          throw badRequest(
            "product.compoundSlotsRequired",
            "Compound products require at least two sections",
          );
        }

        if (new Set(compoundSlots.map((slot) => slot.sortOrder)).size !== compoundSlots.length) {
          throw badRequest(
            "productCompoundSlot.duplicateSortOrder",
            "Compound sections cannot contain duplicated sort orders",
          );
        }

        for (const slot of compoundSlots) {
          if (
            !slot.label ||
            !Number.isInteger(slot.quantity) ||
            slot.quantity <= 0 ||
            !Number.isInteger(slot.sortOrder) ||
            slot.sortOrder < 0
          ) {
            throw badRequest(
              "productCompoundSlot.invalid",
              "Each compound section requires a label and a positive integer quantity",
            );
          }

          if (slot.options.length === 0) {
            throw badRequest(
              "productCompoundSlot.optionsRequired",
              "Each compound section requires at least one product option",
            );
          }

          if (
            new Set(slot.options.map((option) => option.sortOrder)).size !== slot.options.length
          ) {
            throw badRequest(
              "productCompoundSlotOption.duplicateSortOrder",
              "Compound section options cannot contain duplicated sort orders",
            );
          }

          if (
            new Set(slot.options.map((option) => option.productId)).size !== slot.options.length
          ) {
            throw badRequest(
              "productCompoundSlotOption.duplicateProduct",
              "A product cannot be repeated within the same compound section",
            );
          }

          if (
            slot.options.some(
              (option) =>
                !Number.isInteger(option.sortOrder) || option.sortOrder < 0 || option.label === "",
            )
          ) {
            throw badRequest(
              "productCompoundSlotOption.invalid",
              "Compound options require a non-negative integer order and a valid optional label",
            );
          }
        }

        const componentProductIds = [
          ...new Set(
            compoundSlots.flatMap((slot) => slot.options.map((option) => option.productId)),
          ),
        ];

        if (componentProductIds.includes(id)) {
          throw badRequest(
            "productCompoundSlotOption.selfReference",
            "A compound product cannot include itself",
          );
        }

        const componentProducts = await fastify.db.query.productsDB.findMany({
          where(table, { and: andOperator, inArray: inArrayOperator, isNull: isNullOperator }) {
            return andOperator(
              inArrayOperator(table.id, componentProductIds),
              isNullOperator(table.deletedAt),
            );
          },
          columns: {
            id: true,
            productType: true,
          },
        });

        if (componentProducts.length !== componentProductIds.length) {
          throw notFound(
            "productCompoundSlotOption.productNotFound",
            "One or more component products were not found",
          );
        }

        if (componentProducts.some((product) => product.productType === "compound")) {
          throw badRequest(
            "productCompoundSlotOption.nestedCompoundNotAllowed",
            "Compound products cannot include compound products as options",
          );
        }
      }

      if (input.unitId) {
        await fastify.admin.units.get(input.unitId);
      }

      const [categories, taxes, imageUpload] = await Promise.all([
        categoryIds && categoryIds.length > 0
          ? fastify.db
              .select({ id: productCategoriesDB.id })
              .from(productCategoriesDB)
              .where(inArray(productCategoriesDB.id, categoryIds))
          : Promise.resolve([]),
        taxIds && taxIds.length > 0
          ? fastify.db.select({ id: taxDB.id }).from(taxDB).where(inArray(taxDB.id, taxIds))
          : Promise.resolve([]),
        imageUploadId
          ? fastify.db.query.uploadsDB.findFirst({
              columns: { id: true, mimeType: true },
              where(table, { eq: eqOperator }) {
                return eqOperator(table.id, imageUploadId);
              },
            })
          : Promise.resolve(null),
      ]);

      if (categoryIds && categories.length !== categoryIds.length) {
        throw notFound("productCategory.notFound", "One or more product categories were not found");
      }

      if (taxIds && taxes.length !== taxIds.length) {
        throw notFound("tax.notFound", "One or more taxes were not found");
      }

      if (imageUploadId && !imageUpload) {
        throw notFound("upload.notFound", "The image upload was not found");
      }

      if (imageUpload && !imageUpload.mimeType.toLowerCase().startsWith("image/")) {
        throw badRequest("product.invalidImageUpload", "The selected upload must be an image file");
      }

      try {
        await fastify.db.transaction(async (tx) => {
          const [updatedProduct] = await tx
            .update(productsDB)
            .set({
              ...(name !== undefined && { name }),
              ...(input.kitchenName !== undefined && {
                kitchenName: normalizeOptionalText(input.kitchenName),
              }),
              ...(input.customerDescription !== undefined && {
                customerDescription: normalizeOptionalText(input.customerDescription),
              }),
              ...(input.kitchenDescription !== undefined && {
                kitchenDescription: normalizeOptionalText(input.kitchenDescription),
              }),
              ...(input.unitId !== undefined && { unitId: input.unitId }),
              ...(imageUploadId !== undefined && { imageUploadId }),
              ...(input.isFeatured !== undefined && { isFeatured: input.isFeatured }),
              ...(categoryIds !== undefined && { categoryId: categoryIds[0] ?? null }),
              updatedAt: sql`now()`,
            })
            .where(and(eq(productsDB.id, id), isNull(productsDB.deletedAt)))
            .returning({ id: productsDB.id });

          if (!updatedProduct) {
            throw notFound("product.notFound", "The product was not found");
          }

          if (categoryIds !== undefined) {
            await tx.delete(productCategoryLinksDB).where(eq(productCategoryLinksDB.productId, id));

            if (categoryIds.length > 0) {
              await tx.insert(productCategoryLinksDB).values(
                categoryIds.map((categoryId) => ({
                  productId: id,
                  categoryId,
                })),
              );
            }
          }

          if (taxIds !== undefined) {
            await tx.delete(productTaxDB).where(eq(productTaxDB.productId, id));

            if (taxIds.length > 0) {
              await tx.insert(productTaxDB).values(
                taxIds.map((taxId) => ({
                  productId: id,
                  taxId,
                })),
              );
            }
          }

          if (compoundSlots !== undefined) {
            await tx
              .delete(productCompoundSlotsDB)
              .where(eq(productCompoundSlotsDB.compoundProductId, id));
            await tx
              .delete(productCompoundComponentsDB)
              .where(eq(productCompoundComponentsDB.compoundProductId, id));

            const slotRecords = compoundSlots.map((slot) => ({
              id: generateNanoId(),
              compoundProductId: id,
              label: slot.label,
              quantity: slot.quantity,
              sortOrder: slot.sortOrder,
              options: slot.options,
            }));

            await tx
              .insert(productCompoundSlotsDB)
              .values(slotRecords.map(({ options: _options, ...slot }) => slot));
            await tx.insert(productCompoundSlotOptionsDB).values(
              slotRecords.flatMap((slot) =>
                slot.options.map((option) => ({
                  id: generateNanoId(),
                  slotId: slot.id,
                  componentProductId: option.productId,
                  label: option.label,
                  sortOrder: option.sortOrder,
                })),
              ),
            );
          }
        });
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505" && pgError.constraint === "product_name_active_unique") {
          throw conflict("product.duplicatedName", "A product with this name already exists");
        }

        throw error;
      }

      return fastify.admin.products.getGeneral(id, organizationId);
    },

    async createVariation(productId, input) {
      const product = await fastify.db.query.productsDB.findFirst({
        where(table, { eq: eqOperator }) {
          return eqOperator(table.id, productId);
        },
        columns: {
          id: true,
          productType: true,
        },
      });

      if (!product) {
        throw notFound("product.notFound", "The product was not found");
      }

      const productVariationGroups = await fastify.db
        .select({
          variationGroupId: productVariationGroupsDB.variationGroupId,
        })
        .from(productVariationGroupsDB)
        .where(eq(productVariationGroupsDB.productId, productId))
        .orderBy(
          asc(productVariationGroupsDB.sortOrder),
          asc(productVariationGroupsDB.variationGroupId),
        );

      const normalizedVariations = normalizeProductVariationsInput([input]);
      const validatedVariationConfig = await validateProductVariations(
        fastify,
        product.productType,
        productVariationGroups.map((variationGroup) => variationGroup.variationGroupId),
        normalizedVariations,
      );

      try {
        await fastify.db.transaction(async (tx) => {
          await tx
            .update(productsDB)
            .set({
              priceCents: null,
            })
            .where(eq(productsDB.id, productId));

          if (product.productType === "assembled") {
            await tx.delete(recipesDB).where(eq(recipesDB.productId, productId));
          }

          const [nextSortOrderRow] = await tx
            .select({
              nextSortOrder: sql<number>`coalesce(max(${variationsDB.sortOrder}), -1) + 1`,
            })
            .from(variationsDB)
            .where(eq(variationsDB.productId, productId));

          const variationInsertPayloads = buildProductVariationInsertPayloads(
            productId,
            validatedVariationConfig.variations,
            nextSortOrderRow?.nextSortOrder ?? 0,
          );

          if (variationInsertPayloads.createdVariations.length > 0) {
            await tx.insert(variationsDB).values(variationInsertPayloads.createdVariations);
          }

          if (variationInsertPayloads.variationSelections.length > 0) {
            await tx
              .insert(variationSelectionsDB)
              .values(variationInsertPayloads.variationSelections);
          }

          if (variationInsertPayloads.variationRecipes.length > 0) {
            await tx.insert(variationRecipesDB).values(
              variationInsertPayloads.variationRecipes.map(
                ({ variationId, recipe: variationRecipe }) => ({
                  variationId,
                  description: variationRecipe?.description ?? null,
                }),
              ),
            );
          }

          if (variationInsertPayloads.variationRecipeIngredients.length > 0) {
            await tx
              .insert(variationRecipeIngredientsDB)
              .values(variationInsertPayloads.variationRecipeIngredients);
          }

          if (variationInsertPayloads.variationRecipeSupplies.length > 0) {
            await tx
              .insert(variationRecipeSuppliesDB)
              .values(variationInsertPayloads.variationRecipeSupplies);
          }
        });

        const updatedProduct = await fastify.admin.products.get(productId);

        if (!updatedProduct) {
          throw new Error("Failed to retrieve updated product");
        }

        return updatedProduct;
      } catch (error) {
        const pgError = getPgError(error);

        if (
          pgError?.code === "23505" &&
          pgError.constraint === "variation_product_combination_key_active_unique"
        ) {
          throw conflict(
            "productVariation.duplicatedCombination",
            "A variation with this combination already exists for the product",
          );
        }

        throw error;
      }
    },

    async createModifier(productId, input) {
      const product = await fastify.db.query.productsDB.findFirst({
        where(table, { eq: eqOperator }) {
          return eqOperator(table.id, productId);
        },
        columns: {
          id: true,
        },
      });

      if (!product) {
        throw notFound("product.notFound", "The product was not found");
      }

      const [validatedModifierConfig] = await validateProductModifierConfigs(
        fastify,
        [
          {
            modifierId: input.modifierId,
            optionIds: input.optionIds ?? null,
            visibleWhen: input.visibleWhen ?? [],
          },
        ],
        {
          variationGroups: await getProductVariationGroupsForValidation(fastify, productId),
        },
      );

      try {
        await fastify.db.transaction(async (tx) => {
          const [nextSortOrderRow] = await tx
            .select({
              nextSortOrder: sql<number>`coalesce(max(${productModifiersDB.sortOrder}), -1) + 1`,
            })
            .from(productModifiersDB)
            .where(eq(productModifiersDB.productId, productId));

          const productModifierPayloads = buildProductModifierInsertPayloads(
            productId,
            validatedModifierConfig ? [validatedModifierConfig] : [],
            nextSortOrderRow?.nextSortOrder ?? 0,
          );

          if (productModifierPayloads.length > 0) {
            await tx.insert(productModifiersDB).values(productModifierPayloads);
          }

          if (validatedModifierConfig) {
            const productModifierOptionPayloads = buildProductModifierOptionInsertPayloads(
              productId,
              [validatedModifierConfig],
            );

            if (productModifierOptionPayloads.length > 0) {
              await tx.insert(productModifierOptionsDB).values(productModifierOptionPayloads);
            }

            const productModifierVisibilityRulePayloads =
              buildProductModifierVisibilityRuleInsertPayloads(productId, [
                validatedModifierConfig,
              ]);

            if (productModifierVisibilityRulePayloads.length > 0) {
              await tx
                .insert(productModifierVisibilityRulesDB)
                .values(productModifierVisibilityRulePayloads);
            }
          }
        });

        const updatedProduct = await fastify.admin.products.get(productId);

        if (!updatedProduct) {
          throw new Error("Failed to retrieve updated product");
        }

        return updatedProduct;
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505" && pgError.constraint === "product_modifier_pk") {
          throw conflict(
            "productModifier.duplicatedModifier",
            "This modifier is already assigned to the product",
          );
        }

        throw error;
      }
    },

    async updateModifierOptions(productId, modifierId, input) {
      const productModifier = await fastify.db.query.productModifiersDB.findFirst({
        where(table, { and: andOperator, eq: eqOperator }) {
          return andOperator(
            eqOperator(table.productId, productId),
            eqOperator(table.modifierId, modifierId),
          );
        },
        columns: {
          productId: true,
          modifierId: true,
        },
      });

      if (!productModifier) {
        throw notFound("productModifier.notFound", "The product modifier was not found");
      }

      const [validatedModifierConfig] = await validateProductModifierConfigs(
        fastify,
        [
          {
            modifierId,
            optionIds: input.optionIds,
            visibleWhen: input.visibleWhen ?? [],
          },
        ],
        {
          variationGroups: await getProductVariationGroupsForValidation(fastify, productId),
        },
      );

      if (!validatedModifierConfig) {
        throw notFound("modifier.notFound", "The modifier was not found");
      }

      await fastify.db.transaction(async (tx) => {
        await tx
          .delete(productModifierOptionsDB)
          .where(
            and(
              eq(productModifierOptionsDB.productId, productId),
              eq(productModifierOptionsDB.modifierId, modifierId),
            ),
          );

        const productModifierOptionPayloads = buildProductModifierOptionInsertPayloads(productId, [
          validatedModifierConfig,
        ]);

        if (productModifierOptionPayloads.length > 0) {
          await tx.insert(productModifierOptionsDB).values(productModifierOptionPayloads);
        }

        if (input.visibleWhen !== undefined) {
          await tx
            .delete(productModifierVisibilityRulesDB)
            .where(
              and(
                eq(productModifierVisibilityRulesDB.productId, productId),
                eq(productModifierVisibilityRulesDB.modifierId, modifierId),
              ),
            );

          const productModifierVisibilityRulePayloads =
            buildProductModifierVisibilityRuleInsertPayloads(productId, [validatedModifierConfig]);

          if (productModifierVisibilityRulePayloads.length > 0) {
            await tx
              .insert(productModifierVisibilityRulesDB)
              .values(productModifierVisibilityRulePayloads);
          }
        }
      });

      const updatedProduct = await fastify.admin.products.get(productId);

      if (!updatedProduct) {
        throw new Error("Failed to retrieve updated product");
      }

      return updatedProduct;
    },

    async assignOrganization(productId, organizationId) {
      const product = await fastify.db.query.productsDB.findFirst({
        where(table, { and, eq: eqOperator, isNull }) {
          return and(eqOperator(table.id, productId), isNull(table.deletedAt));
        },
        columns: {
          id: true,
        },
      });

      if (!product) {
        throw notFound("product.notFound", "The product was not found");
      }

      await validateProductOrganizations(fastify, [organizationId]);

      try {
        await fastify.db.insert(organizationProductDB).values({
          productId,
          organizationId,
          isActive: true,
        });

        const updatedProduct = await fastify.admin.products.get(productId);

        if (!updatedProduct) {
          throw new Error("Failed to retrieve updated product");
        }

        return updatedProduct;
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505" && pgError.constraint === "organization_product_pk") {
          throw conflict(
            "productOrganization.alreadyAssigned",
            "The product is already assigned to this organization",
          );
        }

        throw error;
      }
    },

    async unassignOrganization(productId, organizationId) {
      const product = await fastify.db.query.productsDB.findFirst({
        where(table, { and, eq: eqOperator, isNull }) {
          return and(eqOperator(table.id, productId), isNull(table.deletedAt));
        },
        columns: {
          id: true,
        },
      });

      if (!product) {
        throw notFound("product.notFound", "The product was not found");
      }

      const [deletedAssignment] = await fastify.db
        .delete(organizationProductDB)
        .where(
          and(
            eq(organizationProductDB.productId, productId),
            eq(organizationProductDB.organizationId, organizationId),
          ),
        )
        .returning({
          productId: organizationProductDB.productId,
        });

      if (!deletedAssignment) {
        throw notFound(
          "productOrganization.notAssigned",
          "The product is not assigned to this organization",
        );
      }

      const updatedProduct = await fastify.admin.products.get(productId);

      if (!updatedProduct) {
        throw new Error("Failed to retrieve updated product");
      }

      return updatedProduct;
    },

    async updateOrganizationStatus(productId, organizationId, isActive) {
      const product = await fastify.db.query.productsDB.findFirst({
        where(table, { and, eq: eqOperator, isNull }) {
          return and(eqOperator(table.id, productId), isNull(table.deletedAt));
        },
        columns: { id: true },
      });

      if (!product) {
        throw notFound("product.notFound", "The product was not found");
      }

      await fastify.db
        .insert(organizationProductDB)
        .values({ productId, organizationId, isActive })
        .onConflictDoUpdate({
          target: [organizationProductDB.productId, organizationProductDB.organizationId],
          set: { isActive, updatedAt: sql`now()` },
        });

      return {
        id: productId,
        organizationStatus: isActive ? "active" : "inactive",
      };
    },

    async updateFeatured(productId, isFeatured) {
      const [updatedProduct] = await fastify.db
        .update(productsDB)
        .set({ isFeatured, updatedAt: sql`now()` })
        .where(and(eq(productsDB.id, productId), isNull(productsDB.deletedAt)))
        .returning({ id: productsDB.id, isFeatured: productsDB.isFeatured });

      if (!updatedProduct) {
        throw notFound("product.notFound", "The product was not found");
      }

      return updatedProduct;
    },

    async updateCategories(productId, input) {
      const categoryIds = [...new Set(input.categoryIds)];
      const [product, categories] = await Promise.all([
        fastify.db.query.productsDB.findFirst({
          where(table, { and, eq: eqOperator, isNull }) {
            return and(eqOperator(table.id, productId), isNull(table.deletedAt));
          },
          columns: { id: true },
        }),
        categoryIds.length > 0
          ? fastify.db
              .select({
                id: productCategoriesDB.id,
                name: productCategoriesDB.name,
                color: productCategoriesDB.color,
              })
              .from(productCategoriesDB)
              .where(inArray(productCategoriesDB.id, categoryIds))
          : Promise.resolve([]),
      ]);

      if (!product) {
        throw notFound("product.notFound", "The product was not found");
      }

      if (categories.length !== categoryIds.length) {
        throw notFound("productCategory.notFound", "One or more product categories were not found");
      }

      await fastify.db.transaction(async (tx) => {
        await tx
          .delete(productCategoryLinksDB)
          .where(eq(productCategoryLinksDB.productId, productId));

        if (categoryIds.length > 0) {
          await tx.insert(productCategoryLinksDB).values(
            categoryIds.map((categoryId) => ({
              productId,
              categoryId,
            })),
          );
        }

        await tx
          .update(productsDB)
          .set({
            categoryId: categoryIds[0] ?? null,
            updatedAt: sql`now()`,
          })
          .where(and(eq(productsDB.id, productId), isNull(productsDB.deletedAt)));
      });

      const categoryById = new Map(categories.map((category) => [category.id, category]));

      return {
        id: productId,
        categories: categoryIds.flatMap((categoryId) => {
          const category = categoryById.get(categoryId);
          return category ? [category] : [];
        }),
      };
    },
  };
}
