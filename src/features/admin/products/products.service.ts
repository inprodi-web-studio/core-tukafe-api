import {
  organizationProductDB,
  productCategoryLinksDB,
  productModifierOptionsDB,
  productModifierVisibilityRulesDB,
  productModifiersDB,
  productsDB,
  productTaxDB,
  productVariationGroupsDB,
  recipeIngredientsDB,
  recipesDB,
  recipeSuppliesDB,
  variationRecipeIngredientsDB,
  variationRecipesDB,
  variationRecipeSuppliesDB,
  variationsDB,
  variationSelectionsDB,
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
import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  buildProductModifierInsertPayloads,
  buildProductModifierOptionInsertPayloads,
  buildProductModifierVisibilityRuleInsertPayloads,
  buildProductVariationInsertPayloads,
  normalizeProductInput,
  normalizeProductVariationsInput,
} from "./products.helpers";
import { mapProductResponse, sortVariationGroupResponse } from "./products.mappers";
import type { AdminProductsService } from "./products.types";
import {
  validateProductBasePrice,
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

export function adminProductsService(fastify: FastifyInstance): AdminProductsService {
  return {
    async get(id, { safe = false } = {}) {
      const [product, recipe, productVariationGroups, variations, productModifiers] =
        await Promise.all([
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
      });
    },

    async list({ search, page, pageSize } = {}) {
      const defaultOrderBy: [SQL, ...SQL[]] = [asc(productsDB.name), asc(productsDB.id)];
      const fuzzySearch = buildFuzzySearch({
        query: search,
        values: [
          productsDB.name,
          productsDB.kitchenName,
          productsDB.customerDescription,
          productsDB.kitchenDescription,
        ],
        tieBreakers: defaultOrderBy,
      });

      const paginatedProducts = await paginate({
        executor: fastify.db,
        createQuery: () => {
          const query = fastify.db
            .select({
              id: productsDB.id,
            })
            .from(productsDB)
            .$dynamic();

          query.where(
            fuzzySearch.where
              ? and(isNull(productsDB.deletedAt), fuzzySearch.where)
              : isNull(productsDB.deletedAt),
          );

          return query;
        },
        orderBy: fuzzySearch.orderBy ?? defaultOrderBy,
        page,
        pageSize,
      });

      if (paginatedProducts.data.length === 0) {
        return {
          data: [],
          pagination: paginatedProducts.pagination,
        };
      }

      const products = await Promise.all(
        paginatedProducts.data.map((product) =>
          fastify.admin.products.get(product.id, { safe: true }),
        ),
      );

      return {
        data: products.filter(
          (product): product is NonNullable<typeof product> => product !== null,
        ),
        pagination: paginatedProducts.pagination,
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

        const [validatedRecipe, validatedVariationConfig, validatedOrganizationIds] =
          await Promise.all([
            validateProductRecipe(fastify, productType, variations.length > 0, recipe),
            validateProductVariations(fastify, productType, variationGroupIds, variations),
            validateProductOrganizations(fastify, organizationIds),
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
  };
}
