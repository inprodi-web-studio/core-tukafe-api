import {
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
  buildProductVariationInsertPayloads,
  normalizeProductInput,
  normalizeProductVariationsInput,
} from "./products.helpers";
import { mapProductResponse } from "./products.mappers";
import type { AdminProductsService } from "./products.types";
import {
  validateProductBasePrice,
  validateProductModifiers,
  validateProductRecipe,
  validateProductVariations,
} from "./products.validators";

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
          },
          with: {
            unit: true,
            category: true,
            taxes: {
              with: {
                tax: true,
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
                options: true,
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
                option: true,
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
        data: products.filter((product): product is NonNullable<typeof product> => product !== null),
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
        recipe,
        taxIds,
        modifierIds,
        variationGroupIds,
        variations,
      } = normalizeProductInput(input);

      try {
        await fastify.admin.units.get(unitId);

        if (categoryId) {
          await fastify.admin.productCategories.get(categoryId);
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

        const [validatedRecipe, validatedVariationConfig, validatedModifierIds] = await Promise.all(
          [
            validateProductRecipe(fastify, productType, variations.length > 0, recipe),
            validateProductVariations(fastify, productType, variationGroupIds, variations),
            validateProductModifiers(fastify, modifierIds),
          ],
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
            })
            .returning();

          if (!createdProduct) {
            throw new Error("Failed to create product");
          }

          if (taxIds.length > 0) {
            await tx.insert(productTaxDB).values(
              taxIds.map((taxId) => ({
                productId: createdProduct.id,
                taxId,
              })),
            );
          }

          const productModifierPayloads = buildProductModifierInsertPayloads(
            createdProduct.id,
            validatedModifierIds,
            0,
          );

          if (productModifierPayloads.length > 0) {
            await tx.insert(productModifiersDB).values(productModifierPayloads);
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
            await tx.insert(variationSelectionsDB).values(variationInsertPayloads.variationSelections);
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
            await tx.insert(variationRecipeSuppliesDB).values(
              variationInsertPayloads.variationRecipeSupplies,
            );
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
            await tx.insert(variationSelectionsDB).values(variationInsertPayloads.variationSelections);
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
            await tx.insert(variationRecipeSuppliesDB).values(
              variationInsertPayloads.variationRecipeSupplies,
            );
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

      await validateProductModifiers(fastify, [input.modifierId]);

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
            [input.modifierId],
            nextSortOrderRow?.nextSortOrder ?? 0,
          );

          if (productModifierPayloads.length > 0) {
            await tx.insert(productModifiersDB).values(productModifierPayloads);
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
  };
}
