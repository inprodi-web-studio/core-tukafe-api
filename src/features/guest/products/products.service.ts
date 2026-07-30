import {
  organizationProductDB,
  orderItemsDB,
  orderPaymentAttemptsDB,
  ordersDB,
  productCategoryLinksDB,
  productCompoundComponentsDB,
  productCompoundSlotsDB,
  productVariationGroupsDB,
  productsDB,
  variationsDB,
} from "@core/db/schemas";
import { notFound } from "@core/utils";
import { and, asc, desc, eq, exists, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  GuestProductConfigurationModifierOption,
  GuestProductConfigurationVariation,
  GuestProductConfigurationVariationOption,
  GuestProductListItem,
  GuestProductsService,
  GuestProductVariation,
  GuestProductVariationGroup,
} from "./products.types";
import { hasAvailableCompoundConfiguration } from "./products.availability";

function sortVariationGroups(
  variationGroups: GuestProductVariationGroup[],
): GuestProductVariationGroup[] {
  return [...variationGroups].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    if (left.name !== right.name) {
      return left.name.localeCompare(right.name);
    }

    return left.id.localeCompare(right.id);
  });
}

function sortVariations(variations: GuestProductVariation[]): GuestProductVariation[] {
  return [...variations].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.id.localeCompare(right.id);
  });
}

function sortConfigurationVariations(
  variations: GuestProductConfigurationVariation[],
): GuestProductConfigurationVariation[] {
  return [...variations].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.id.localeCompare(right.id);
  });
}

function sortVariationOptions(
  options: GuestProductConfigurationVariationOption[],
): GuestProductConfigurationVariationOption[] {
  return [...options].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    if (left.name !== right.name) {
      return left.name.localeCompare(right.name);
    }

    return left.id.localeCompare(right.id);
  });
}

function sortModifierOptions(
  options: GuestProductConfigurationModifierOption[],
): GuestProductConfigurationModifierOption[] {
  return [...options].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    if (left.name !== right.name) {
      return left.name.localeCompare(right.name);
    }

    return left.id.localeCompare(right.id);
  });
}

function getRandomProducts(
  products: GuestProductListItem[],
  limit: number,
): GuestProductListItem[] {
  const randomProducts = [...products];

  for (let index = randomProducts.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const currentProduct = randomProducts[index]!;
    const swapProduct = randomProducts[swapIndex]!;

    randomProducts[index] = swapProduct;
    randomProducts[swapIndex] = currentProduct;
  }

  return randomProducts.slice(0, limit);
}

async function productModifierOptionsTableExists(fastify: FastifyInstance): Promise<boolean> {
  const result = await fastify.db.execute<{ exists: boolean }>(sql`
    select to_regclass('public.product_modifier_option') is not null as "exists"
  `);

  return result.rows[0]?.exists ?? false;
}

async function productModifierVisibilityRulesTableExists(
  fastify: FastifyInstance,
): Promise<boolean> {
  const result = await fastify.db.execute<{ exists: boolean }>(sql`
    select to_regclass('public.product_modifier_visibility_rule') is not null as "exists"
  `);

  return result.rows[0]?.exists ?? false;
}

async function getActiveProductIdsForOrganization(
  fastify: FastifyInstance,
  organizationId: string,
  productIds: string[],
): Promise<Set<string>> {
  if (productIds.length === 0) {
    return new Set();
  }

  const activeProducts = await fastify.db
    .select({
      productId: organizationProductDB.productId,
    })
    .from(organizationProductDB)
    .innerJoin(productsDB, eq(organizationProductDB.productId, productsDB.id))
    .where(
      and(
        eq(organizationProductDB.organizationId, organizationId),
        eq(organizationProductDB.isActive, true),
        inArray(organizationProductDB.productId, productIds),
        isNull(productsDB.deletedAt),
      ),
    );

  return new Set(activeProducts.map((product) => product.productId));
}

async function getAvailableCompoundProductIds(
  fastify: FastifyInstance,
  organizationId: string,
  compoundProductIds: string[],
): Promise<Set<string>> {
  if (compoundProductIds.length === 0) {
    return new Set();
  }

  const [slots, legacyComponents] = await Promise.all([
    fastify.db.query.productCompoundSlotsDB.findMany({
      where: inArray(productCompoundSlotsDB.compoundProductId, compoundProductIds),
      columns: {
        id: true,
        compoundProductId: true,
      },
      with: {
        options: {
          columns: {
            componentProductId: true,
          },
        },
      },
    }),
    fastify.db.query.productCompoundComponentsDB.findMany({
      where: inArray(productCompoundComponentsDB.compoundProductId, compoundProductIds),
      columns: {
        compoundProductId: true,
        componentProductId: true,
        sortOrder: true,
      },
    }),
  ]);

  const componentProductIds = [
    ...new Set([
      ...slots.flatMap((slot) => slot.options.map((option) => option.componentProductId)),
      ...legacyComponents.map((component) => component.componentProductId),
    ]),
  ];
  const activeProductIds = await getActiveProductIdsForOrganization(
    fastify,
    organizationId,
    componentProductIds,
  );
  const slotsByCompoundProductId = new Map<string, Array<{ optionProductIds: string[] }>>();
  const compoundsUsingSlots = new Set(slots.map((slot) => slot.compoundProductId));

  for (const slot of slots) {
    const currentSlots = slotsByCompoundProductId.get(slot.compoundProductId) ?? [];
    currentSlots.push({
      optionProductIds: slot.options.map((option) => option.componentProductId),
    });
    slotsByCompoundProductId.set(slot.compoundProductId, currentSlots);
  }

  for (const component of legacyComponents) {
    if (compoundsUsingSlots.has(component.compoundProductId)) {
      continue;
    }

    const currentSlots = slotsByCompoundProductId.get(component.compoundProductId) ?? [];
    currentSlots.push({
      optionProductIds: [component.componentProductId],
    });
    slotsByCompoundProductId.set(component.compoundProductId, currentSlots);
  }

  const availableCompoundProductIds = new Set<string>();

  for (const compoundProductId of compoundProductIds) {
    const compoundSlots = slotsByCompoundProductId.get(compoundProductId) ?? [];
    if (hasAvailableCompoundConfiguration(compoundSlots, activeProductIds)) {
      availableCompoundProductIds.add(compoundProductId);
    }
  }

  return availableCompoundProductIds;
}

export function guestProductsService(fastify: FastifyInstance): GuestProductsService {
  const service: GuestProductsService = {
    async list(input = {}) {
      const organizationId = input.organizationId ?? null;
      const categoryId = input.categoryId ?? null;
      const categoryFilter = categoryId
        ? or(
            eq(productsDB.categoryId, categoryId),
            exists(
              fastify.db
                .select({ productId: productCategoryLinksDB.productId })
                .from(productCategoryLinksDB)
                .where(
                  and(
                    eq(productCategoryLinksDB.productId, productsDB.id),
                    eq(productCategoryLinksDB.categoryId, categoryId),
                  ),
                ),
            ),
          )
        : undefined;
      const products = await fastify.db.query.productsDB.findMany({
        where: categoryFilter
          ? and(isNull(productsDB.deletedAt), categoryFilter)
          : isNull(productsDB.deletedAt),
        columns: {
          kitchenName: false,
          kitchenDescription: false,
          unitId: false,
          categoryId: false,
          imageUploadId: false,
          createdAt: false,
          updatedAt: false,
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
          category: {
            columns: {
              id: true,
              name: true,
              icon: true,
              color: true,
              sortOrder: true,
              isFourPlusOneEligible: true,
              isCashbackEligible: true,
              parentId: true,
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
                  id: true,
                  name: true,
                  icon: true,
                  color: true,
                  sortOrder: true,
                  isFourPlusOneEligible: true,
                  isCashbackEligible: true,
                  parentId: true,
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
        orderBy: [asc(productsDB.name), asc(productsDB.id)],
      });

      const productIds = products.map((product) => product.id);

      if (productIds.length === 0) {
        return [];
      }

      const [organizationLinks, variationGroupLinks, variations] = await Promise.all([
        fastify.db.query.organizationProductDB.findMany({
          where(table, { and, eq, inArray }) {
            const filters = [inArray(table.productId, productIds), eq(table.isActive, true)];

            if (organizationId) {
              filters.push(eq(table.organizationId, organizationId));
            }

            return and(...filters);
          },
          columns: {
            productId: true,
            organizationId: false,
            isActive: false,
            createdAt: false,
            updatedAt: false,
          },
          with: {
            organization: {
              columns: {
                id: true,
                name: true,
                slug: true,
                address: true,
                latitude: true,
                longitude: true,
                logo: true,
                deletedAt: true,
              },
            },
          },
        }),
        fastify.db.query.productVariationGroupsDB.findMany({
          where: inArray(productVariationGroupsDB.productId, productIds),
          columns: {
            productId: true,
            variationGroupId: false,
            createdAt: false,
            updatedAt: false,
          },
          with: {
            group: {
              columns: {
                id: true,
                name: true,
                customerLabel: true,
                sortOrder: true,
              },
              with: {
                options: {
                  columns: {
                    id: true,
                    variationGroupId: true,
                    name: true,
                    customerDescription: true,
                    imageUploadId: false,
                    sortOrder: true,
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
          where: and(inArray(variationsDB.productId, productIds), isNull(variationsDB.deletedAt)),
          columns: {
            id: true,
            productId: true,
            sortOrder: true,
            priceCents: true,
            customerDescription: true,
            combinationKey: false,
            kitchenName: false,
            kitchenDescription: false,
            createdAt: false,
            updatedAt: false,
            deletedAt: false,
          },
          with: {
            selections: {
              columns: {
                variationId: false,
                variationGroupId: false,
                variationOptionId: false,
                createdAt: false,
                updatedAt: false,
              },
              with: {
                group: {
                  columns: {
                    id: true,
                    name: true,
                    customerLabel: true,
                    sortOrder: true,
                  },
                },
                option: {
                  columns: {
                    id: true,
                    variationGroupId: true,
                    name: true,
                    customerDescription: true,
                    imageUploadId: false,
                    sortOrder: true,
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
      ]);

      const organizationsByProductId = new Map<string, GuestProductListItem["organizations"]>();

      for (const link of organizationLinks) {
        if (link.organization.deletedAt) {
          continue;
        }

        const currentOrganizations = organizationsByProductId.get(link.productId) ?? [];

        currentOrganizations.push({
          id: link.organization.id,
          name: link.organization.name,
          slug: link.organization.slug,
          address: link.organization.address,
          latitude: link.organization.latitude,
          longitude: link.organization.longitude,
          logo: link.organization.logo ?? null,
        });

        organizationsByProductId.set(link.productId, currentOrganizations);
      }

      const variationGroupsByProductId = new Map<string, GuestProductVariationGroup[]>();

      for (const link of variationGroupLinks) {
        const currentGroups = variationGroupsByProductId.get(link.productId) ?? [];

        currentGroups.push({
          ...link.group,
          customerLabel: link.group.customerLabel ?? null,
          options: [...link.group.options].sort((left, right) => {
            if (left.sortOrder !== right.sortOrder) {
              return left.sortOrder - right.sortOrder;
            }

            if (left.name !== right.name) {
              return left.name.localeCompare(right.name);
            }

            return left.id.localeCompare(right.id);
          }),
        });

        variationGroupsByProductId.set(link.productId, currentGroups);
      }

      const variationsByProductId = new Map<string, GuestProductVariation[]>();

      for (const variation of variations) {
        const currentVariations = variationsByProductId.get(variation.productId) ?? [];

        currentVariations.push({
          id: variation.id,
          sortOrder: variation.sortOrder,
          priceCents: variation.priceCents,
          customerDescription: variation.customerDescription ?? null,
          selections: [...variation.selections].sort((left, right) => {
            if (left.group.sortOrder !== right.group.sortOrder) {
              return left.group.sortOrder - right.group.sortOrder;
            }

            if (left.group.name !== right.group.name) {
              return left.group.name.localeCompare(right.group.name);
            }

            return left.group.id.localeCompare(right.group.id);
          }),
        });

        variationsByProductId.set(variation.productId, currentVariations);
      }

      const compoundProductIds = products
        .filter((product) => product.productType === "compound")
        .map((product) => product.id);
      const availableCompoundProductIds = organizationId
        ? await getAvailableCompoundProductIds(fastify, organizationId, compoundProductIds)
        : new Set(compoundProductIds);

      return products
        .map<GuestProductListItem>((product) => ({
          id: product.id,
          name: product.name,
          priceCents: product.priceCents,
          isFeatured: product.isFeatured,
          customerDescription: product.customerDescription ?? null,
          productType: product.productType,
          image: product.image,
          unit: product.unit,
          category: product.category,
          categories: [...product.categories]
            .sort((left, right) => {
              if (left.category.sortOrder !== right.category.sortOrder) {
                return left.category.sortOrder - right.category.sortOrder;
              }

              if (left.category.name !== right.category.name) {
                return left.category.name.localeCompare(right.category.name);
              }

              return left.category.id.localeCompare(right.category.id);
            })
            .map(({ category }) => category),
          organizations: [...(organizationsByProductId.get(product.id) ?? [])].sort(
            (left, right) => {
              if (left.name !== right.name) {
                return left.name.localeCompare(right.name);
              }

              return left.id.localeCompare(right.id);
            },
          ),
          taxes: product.taxes.map(({ tax }) => tax),
          variationGroups: sortVariationGroups(variationGroupsByProductId.get(product.id) ?? []),
          variations: sortVariations(variationsByProductId.get(product.id) ?? []),
        }))
        .filter(
          (product) =>
            !organizationId ||
            (product.organizations.length > 0 &&
              (product.productType !== "compound" || availableCompoundProductIds.has(product.id))),
        );
    },

    async listPopular(input = {}) {
      const limit = input.limit ?? 10;
      const windowDays = input.windowDays ?? 30;
      const organizationId = input.organizationId ?? null;
      const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
      const orderedUnitsCount = sql<number>`sum(${orderItemsDB.quantity})::double precision`;

      const popularProducts = await fastify.db
        .select({
          productId: orderItemsDB.productId,
          orderedUnitsCount,
        })
        .from(orderItemsDB)
        .innerJoin(ordersDB, eq(orderItemsDB.orderId, ordersDB.id))
        .innerJoin(productsDB, eq(orderItemsDB.productId, productsDB.id))
        .where(
          and(
            isNull(productsDB.deletedAt),
            gte(ordersDB.createdAt, windowStart),
            exists(
              fastify.db
                .select({ id: orderPaymentAttemptsDB.id })
                .from(orderPaymentAttemptsDB)
                .where(
                  and(
                    eq(orderPaymentAttemptsDB.orderId, ordersDB.id),
                    eq(orderPaymentAttemptsDB.status, "completed"),
                  ),
                ),
            ),
          ),
        )
        .groupBy(orderItemsDB.productId, productsDB.name, productsDB.id)
        .orderBy(desc(orderedUnitsCount), asc(productsDB.name), asc(productsDB.id));

      const salesByProductId = new Map(
        popularProducts.map((product) => [
          product.productId,
          Number(product.orderedUnitsCount ?? 0),
        ]),
      );
      const availableProducts = await service.list({ organizationId });
      const availableProductsById = new Map(
        availableProducts.map((product) => [product.id, product]),
      );
      const selectedProductIds = new Set<string>();
      const selectedProducts: GuestProductListItem[] = [];
      const compareBySalesThenName = (left: GuestProductListItem, right: GuestProductListItem) => {
        const leftSales = salesByProductId.get(left.id) ?? 0;
        const rightSales = salesByProductId.get(right.id) ?? 0;

        if (leftSales !== rightSales) {
          return rightSales - leftSales;
        }

        if (left.name !== right.name) {
          return left.name.localeCompare(right.name);
        }

        return left.id.localeCompare(right.id);
      };
      const pushProducts = (productsToAdd: GuestProductListItem[]) => {
        for (const product of productsToAdd) {
          if (selectedProducts.length >= limit || selectedProductIds.has(product.id)) {
            continue;
          }

          selectedProductIds.add(product.id);
          selectedProducts.push(product);
        }
      };

      pushProducts(
        availableProducts.filter((product) => product.isFeatured).sort(compareBySalesThenName),
      );

      pushProducts(
        popularProducts
          .map((product) => availableProductsById.get(product.productId))
          .filter(
            (product): product is GuestProductListItem => product != null && !product.isFeatured,
          ),
      );

      pushProducts(
        getRandomProducts(
          availableProducts.filter((product) => !selectedProductIds.has(product.id)),
          Math.max(limit - selectedProducts.length, 0),
        ),
      );

      return selectedProducts.slice(0, limit);
    },

    async listRecommended(input) {
      const limit = input.limit ?? 10;
      const windowDays = input.windowDays ?? 90;
      const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
      const orderedUnitsCount = sql<number>`sum(${orderItemsDB.quantity})::double precision`;
      const orderedOrdersCount = sql<number>`count(distinct ${ordersDB.id})::integer`;
      const lastOrderedAt = sql<Date>`max(${ordersDB.createdAt})`;

      const recommendedProducts = await fastify.db
        .select({
          productId: orderItemsDB.productId,
          orderedUnitsCount,
          orderedOrdersCount,
          lastOrderedAt,
        })
        .from(orderItemsDB)
        .innerJoin(ordersDB, eq(orderItemsDB.orderId, ordersDB.id))
        .innerJoin(productsDB, eq(orderItemsDB.productId, productsDB.id))
        .where(
          and(
            eq(ordersDB.customerId, input.customerId),
            isNull(productsDB.deletedAt),
            gte(ordersDB.createdAt, windowStart),
            exists(
              fastify.db
                .select({ id: orderPaymentAttemptsDB.id })
                .from(orderPaymentAttemptsDB)
                .where(
                  and(
                    eq(orderPaymentAttemptsDB.orderId, ordersDB.id),
                    eq(orderPaymentAttemptsDB.status, "completed"),
                  ),
                ),
            ),
          ),
        )
        .groupBy(orderItemsDB.productId, productsDB.name, productsDB.id)
        .orderBy(
          desc(lastOrderedAt),
          desc(orderedUnitsCount),
          desc(orderedOrdersCount),
          asc(productsDB.name),
          asc(productsDB.id),
        )
        .limit(limit);

      const availableProducts = await service.list({ organizationId: input.organizationId });
      const availableProductsById = new Map(
        availableProducts.map((product) => [product.id, product]),
      );
      const hydratedRecommendedProducts = recommendedProducts
        .map((product) => availableProductsById.get(product.productId))
        .filter((product): product is GuestProductListItem => product != null);

      if (hydratedRecommendedProducts.length === 0) {
        return getRandomProducts(availableProducts, limit);
      }

      return hydratedRecommendedProducts;
    },

    async getConfiguration(productId, organizationId = null) {
      const product = await fastify.db.query.productsDB.findFirst({
        where(table, { and: andOperator, eq, isNull: isNullOperator }) {
          return andOperator(eq(table.id, productId), isNullOperator(table.deletedAt));
        },
        columns: {
          id: true,
          name: true,
          priceCents: true,
          isFeatured: true,
          productType: true,
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

      if (!product) {
        throw notFound("product.notFound", "The product was not found");
      }

      if (organizationId) {
        const activeProductIds = await getActiveProductIdsForOrganization(fastify, organizationId, [
          product.id,
        ]);

        if (!activeProductIds.has(product.id)) {
          throw notFound(
            "product.notAvailableInOrganization",
            "The product is not available in this organization",
          );
        }
      }

      const [includeAllowedModifierOptions, includeModifierVisibilityRules] = await Promise.all([
        productModifierOptionsTableExists(fastify),
        productModifierVisibilityRulesTableExists(fastify),
      ]);

      const [
        variationGroupLinks,
        variations,
        modifierLinks,
        allowedModifierOptions,
        visibilityRules,
      ] = await Promise.all([
        fastify.db.query.productVariationGroupsDB.findMany({
          where(table, { eq }) {
            return eq(table.productId, productId);
          },
          columns: {
            productId: false,
            variationGroupId: false,
            sortOrder: true,
            createdAt: false,
            updatedAt: false,
          },
          with: {
            group: {
              columns: {
                id: true,
                name: true,
                customerLabel: true,
              },
              with: {
                options: {
                  columns: {
                    id: true,
                    name: true,
                    customerDescription: true,
                    imageUploadId: false,
                    sortOrder: true,
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
          where(table, { and: andOperator, eq, isNull: isNullOperator }) {
            return andOperator(eq(table.productId, productId), isNullOperator(table.deletedAt));
          },
          columns: {
            id: true,
            productId: false,
            sortOrder: true,
            priceCents: true,
            customerDescription: true,
            combinationKey: false,
            kitchenName: false,
            kitchenDescription: false,
            createdAt: false,
            updatedAt: false,
            deletedAt: false,
          },
          with: {
            selections: {
              columns: {
                variationId: false,
                variationGroupId: true,
                variationOptionId: true,
                createdAt: false,
                updatedAt: false,
              },
              with: {
                group: {
                  columns: {
                    id: true,
                    name: true,
                    sortOrder: true,
                  },
                },
              },
            },
          },
        }),
        fastify.db.query.productModifiersDB.findMany({
          where(table, { eq }) {
            return eq(table.productId, productId);
          },
          columns: {
            productId: true,
            modifierId: false,
            sortOrder: true,
            createdAt: false,
            updatedAt: false,
          },
          with: {
            modifier: {
              columns: {
                id: true,
                name: true,
                customerLabel: true,
                multiSelect: true,
                minSelect: true,
                maxSelect: true,
              },
              with: {
                options: {
                  columns: {
                    id: true,
                    name: true,
                    customerName: true,
                    priceCents: true,
                    sortOrder: true,
                    isDefault: true,
                  },
                },
              },
            },
          },
        }),
        includeAllowedModifierOptions
          ? fastify.db.query.productModifierOptionsDB.findMany({
              where(table, { eq }) {
                return eq(table.productId, productId);
              },
              columns: {
                productId: true,
                modifierId: true,
                modifierOptionId: true,
                createdAt: false,
                updatedAt: false,
              },
            })
          : Promise.resolve([]),
        includeModifierVisibilityRules
          ? fastify.db.query.productModifierVisibilityRulesDB.findMany({
              where(table, { eq }) {
                return eq(table.productId, productId);
              },
              columns: {
                productId: true,
                modifierId: true,
                variationGroupId: true,
                variationOptionId: true,
                createdAt: false,
                updatedAt: false,
              },
            })
          : Promise.resolve([]),
      ]);

      const allowedOptionIdsByModifier = new Map<string, Set<string>>();
      for (const allowedOption of allowedModifierOptions) {
        const key = `${allowedOption.productId}:${allowedOption.modifierId}`;
        const current = allowedOptionIdsByModifier.get(key) ?? new Set<string>();
        current.add(allowedOption.modifierOptionId);
        allowedOptionIdsByModifier.set(key, current);
      }

      const visibilityRulesByModifier = new Map<
        string,
        Array<{ variationGroupId: string; variationOptionId: string }>
      >();
      for (const rule of visibilityRules) {
        const key = `${rule.productId}:${rule.modifierId}`;
        const currentRules = visibilityRulesByModifier.get(key) ?? [];
        currentRules.push({
          variationGroupId: rule.variationGroupId,
          variationOptionId: rule.variationOptionId,
        });
        visibilityRulesByModifier.set(key, currentRules);
      }

      const variationSteps = [...variationGroupLinks]
        .sort((left, right) => {
          if (left.sortOrder !== right.sortOrder) {
            return left.sortOrder - right.sortOrder;
          }

          if (left.group.name !== right.group.name) {
            return left.group.name.localeCompare(right.group.name);
          }

          return left.group.id.localeCompare(right.group.id);
        })
        .map((link) => ({
          type: "variation" as const,
          id: link.group.id,
          name: link.group.name,
          label: link.group.customerLabel ?? link.group.name,
          required: true,
          minSelect: 1,
          maxSelect: 1 as const,
          sortOrder: link.sortOrder,
          options: sortVariationOptions(
            link.group.options.map((option) => ({
              id: option.id,
              name: option.name,
              customerDescription: option.customerDescription ?? null,
              image: option.image,
              sortOrder: option.sortOrder,
            })),
          ),
        }));

      const modifierSteps = [...modifierLinks]
        .sort((left, right) => {
          if (left.sortOrder !== right.sortOrder) {
            return left.sortOrder - right.sortOrder;
          }

          if (left.modifier.name !== right.modifier.name) {
            return left.modifier.name.localeCompare(right.modifier.name);
          }

          return left.modifier.id.localeCompare(right.modifier.id);
        })
        .map((link) => {
          const allowedOptionIds =
            allowedOptionIdsByModifier.get(`${link.productId}:${link.modifier.id}`) ??
            new Set<string>();
          const options =
            allowedOptionIds.size > 0
              ? link.modifier.options.filter((option) => allowedOptionIds.has(option.id))
              : link.modifier.options;

          return {
            type: "modifier" as const,
            id: link.modifier.id,
            name: link.modifier.name,
            label: link.modifier.customerLabel ?? link.modifier.name,
            required: link.modifier.minSelect > 0,
            multiSelect: link.modifier.multiSelect,
            minSelect: link.modifier.minSelect,
            maxSelect: link.modifier.multiSelect ? link.modifier.maxSelect : 1,
            sortOrder: link.sortOrder,
            visibleWhen: [
              ...(visibilityRulesByModifier.get(`${link.productId}:${link.modifier.id}`) ?? []),
            ].sort((left, right) => {
              if (left.variationGroupId !== right.variationGroupId) {
                return left.variationGroupId.localeCompare(right.variationGroupId);
              }

              return left.variationOptionId.localeCompare(right.variationOptionId);
            }),
            options: sortModifierOptions(
              options.map((option) => {
                const customerName = option.customerName?.trim();

                return {
                  id: option.id,
                  name: customerName && customerName.length > 0 ? customerName : option.name,
                  priceCents: option.priceCents,
                  isDefault: option.isDefault,
                  sortOrder: option.sortOrder,
                };
              }),
            ),
          };
        });

      const configuration = {
        product: {
          id: product.id,
          name: product.name,
          isFeatured: product.isFeatured,
          productType: product.productType,
          image: product.image,
        },
        pricing: {
          basePriceCents: product.priceCents,
          usesVariationPricing: variations.length > 0,
        },
        steps: [...variationSteps, ...modifierSteps],
        variations: sortConfigurationVariations(
          variations.map((variation) => ({
            id: variation.id,
            sortOrder: variation.sortOrder,
            priceCents: variation.priceCents,
            customerDescription: variation.customerDescription ?? null,
            selections: [...variation.selections]
              .sort((left, right) => {
                if (left.group.sortOrder !== right.group.sortOrder) {
                  return left.group.sortOrder - right.group.sortOrder;
                }

                if (left.group.name !== right.group.name) {
                  return left.group.name.localeCompare(right.group.name);
                }

                return left.group.id.localeCompare(right.group.id);
              })
              .map((selection) => ({
                variationGroupId: selection.variationGroupId,
                variationOptionId: selection.variationOptionId,
              })),
          })),
        ),
      };

      if (product.productType !== "compound") {
        return {
          ...configuration,
          compoundComponents: [],
          compoundSlots: [],
        };
      }

      const [compoundSlots, compoundComponents] = await Promise.all([
        fastify.db.query.productCompoundSlotsDB.findMany({
          where(table, { eq }) {
            return eq(table.compoundProductId, product.id);
          },
          columns: {
            id: true,
            compoundProductId: true,
            label: true,
            quantity: true,
            sortOrder: true,
            createdAt: false,
            updatedAt: false,
          },
          with: {
            options: {
              columns: {
                id: true,
                slotId: true,
                componentProductId: true,
                label: true,
                sortOrder: true,
                createdAt: false,
                updatedAt: false,
              },
              orderBy(table, { asc }) {
                return [asc(table.sortOrder), asc(table.componentProductId)];
              },
            },
          },
          orderBy(table, { asc }) {
            return [asc(table.sortOrder), asc(table.id)];
          },
        }),
        fastify.db.query.productCompoundComponentsDB.findMany({
          where(table, { eq }) {
            return eq(table.compoundProductId, product.id);
          },
          columns: {
            compoundProductId: true,
            componentProductId: true,
            quantity: true,
            sortOrder: true,
            label: true,
            createdAt: false,
            updatedAt: false,
          },
          orderBy(table, { asc }) {
            return [asc(table.sortOrder), asc(table.componentProductId)];
          },
        }),
      ]);

      const resolvedCompoundSlots =
        compoundSlots.length > 0
          ? compoundSlots
          : compoundComponents.map((component) => ({
              id: `${component.compoundProductId}:${component.sortOrder}`,
              compoundProductId: component.compoundProductId,
              label: component.label ?? `Componente ${component.sortOrder + 1}`,
              quantity: component.quantity,
              sortOrder: component.sortOrder,
              options: [
                {
                  id: `${component.compoundProductId}:${component.sortOrder}:0`,
                  slotId: `${component.compoundProductId}:${component.sortOrder}`,
                  componentProductId: component.componentProductId,
                  label: component.label,
                  sortOrder: 0,
                },
              ],
            }));

      const activeComponentProductIds = organizationId
        ? await getActiveProductIdsForOrganization(fastify, organizationId, [
            ...new Set(
              resolvedCompoundSlots.flatMap((slot) =>
                slot.options.map((option) => option.componentProductId),
              ),
            ),
          ])
        : null;
      const availableCompoundSlots = resolvedCompoundSlots.map((slot) => ({
        ...slot,
        options: activeComponentProductIds
          ? slot.options.filter((option) =>
              activeComponentProductIds.has(option.componentProductId),
            )
          : slot.options,
      }));

      if (
        organizationId &&
        (availableCompoundSlots.length < 2 ||
          availableCompoundSlots.some((slot) => slot.options.length === 0))
      ) {
        throw notFound(
          "product.notAvailableInOrganization",
          "The product is not available in this organization",
        );
      }

      const compoundSlotResponses = await Promise.all(
        availableCompoundSlots.map(async (slot) => ({
          slotId: slot.id,
          label: slot.label,
          quantity: slot.quantity,
          sortOrder: slot.sortOrder,
          options: await Promise.all(
            slot.options.map(async (option) => {
              const optionConfiguration = await service.getConfiguration(
                option.componentProductId,
                organizationId,
              );

              return {
                optionId: option.id,
                productId: option.componentProductId,
                sortOrder: option.sortOrder,
                label: option.label,
                product: optionConfiguration.product,
                pricing: optionConfiguration.pricing,
                steps: optionConfiguration.steps,
                variations: optionConfiguration.variations,
              };
            }),
          ),
        })),
      );

      return {
        ...configuration,
        compoundSlots: compoundSlotResponses,
        compoundComponents: await Promise.all(
          availableCompoundSlots
            .flatMap((slot) => {
              if (slot.options.length !== 1) {
                return [];
              }

              const [option] = slot.options;
              if (!option) {
                return [];
              }

              return [
                {
                  componentId: slot.id,
                  quantity: slot.quantity,
                  sortOrder: slot.sortOrder,
                  label: slot.label,
                  componentProductId: option.componentProductId,
                },
              ];
            })
            .map(async (component) => {
              const componentConfiguration = await service.getConfiguration(
                component.componentProductId,
                organizationId,
              );

              return {
                componentId: component.componentId,
                quantity: component.quantity,
                sortOrder: component.sortOrder,
                label: component.label,
                product: componentConfiguration.product,
                pricing: componentConfiguration.pricing,
                steps: componentConfiguration.steps,
                variations: componentConfiguration.variations,
              };
            }),
        ),
      };
    },

    async getCustomerProductOrderCount(productId, customerId) {
      const product = await fastify.db.query.productsDB.findFirst({
        where(table, { and: andOperator, eq, isNull: isNullOperator }) {
          return andOperator(eq(table.id, productId), isNullOperator(table.deletedAt));
        },
        columns: {
          id: true,
        },
      });

      if (!product) {
        throw notFound("product.notFound", "The product was not found");
      }

      const [customerProductCount] = await fastify.db
        .select({
          orderedUnitsCount: sql<number>`coalesce(sum(${orderItemsDB.quantity}), 0)::double precision`,
        })
        .from(orderItemsDB)
        .innerJoin(ordersDB, eq(orderItemsDB.orderId, ordersDB.id))
        .where(and(eq(ordersDB.customerId, customerId), eq(orderItemsDB.productId, productId)));

      return {
        productId,
        customerId,
        orderedUnitsCount: Number(customerProductCount?.orderedUnitsCount ?? 0),
      };
    },
  };

  return service;
}
