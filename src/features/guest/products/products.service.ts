import {
  orderItemsDB,
  ordersDB,
  productVariationGroupsDB,
  productsDB,
  variationsDB,
} from "@core/db/schemas";
import { notFound } from "@core/utils";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
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

export function guestProductsService(fastify: FastifyInstance): GuestProductsService {
  return {
    async list() {
      const products = await fastify.db.query.productsDB.findMany({
        where: isNull(productsDB.deletedAt),
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
              isFourPlusOneEligible: true,
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
            return and(inArray(table.productId, productIds), eq(table.isActive, true));
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

      return products.map<GuestProductListItem>((product) => ({
        id: product.id,
        name: product.name,
        priceCents: product.priceCents,
        customerDescription: product.customerDescription ?? null,
        productType: product.productType,
        image: product.image,
        unit: product.unit,
        category: product.category,
        organizations: [...(organizationsByProductId.get(product.id) ?? [])].sort((left, right) => {
          if (left.name !== right.name) {
            return left.name.localeCompare(right.name);
          }

          return left.id.localeCompare(right.id);
        }),
        taxes: product.taxes.map(({ tax }) => tax),
        variationGroups: sortVariationGroups(variationGroupsByProductId.get(product.id) ?? []),
        variations: sortVariations(variationsByProductId.get(product.id) ?? []),
      }));
    },

    async getConfiguration(productId) {
      const product = await fastify.db.query.productsDB.findFirst({
        where(table, { and: andOperator, eq, isNull: isNullOperator }) {
          return andOperator(eq(table.id, productId), isNullOperator(table.deletedAt));
        },
        columns: {
          id: true,
          name: true,
          priceCents: true,
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

      const [variationGroupLinks, variations, modifierLinks] = await Promise.all([
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
            productId: false,
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
      ]);

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
        .map((link) => ({
          type: "modifier" as const,
          id: link.modifier.id,
          name: link.modifier.name,
          label: link.modifier.customerLabel ?? link.modifier.name,
          required: link.modifier.minSelect > 0,
          multiSelect: link.modifier.multiSelect,
          minSelect: link.modifier.minSelect,
          maxSelect: link.modifier.multiSelect ? link.modifier.maxSelect : 1,
          sortOrder: link.sortOrder,
          options: sortModifierOptions(
            link.modifier.options.map((option) => ({
              id: option.id,
              name: option.customerName ?? option.name,
              priceCents: option.priceCents,
              isDefault: option.isDefault,
              sortOrder: option.sortOrder,
            })),
          ),
        }));

      return {
        product: {
          id: product.id,
          name: product.name,
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
}
