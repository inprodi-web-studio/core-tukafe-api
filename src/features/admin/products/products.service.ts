import {
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
import { conflict, generateNanoId, getPgError, notFound } from "@core/utils";
import type { FastifyInstance } from "fastify";
import { normalizeProductInput } from "./products.helpers";
import { mapProductResponse } from "./products.mappers";
import type { AdminProductsService } from "./products.types";
import {
  validateProductBasePrice,
  validateProductRecipe,
  validateProductVariations,
} from "./products.validators";

export function adminProductsService(fastify: FastifyInstance): AdminProductsService {
  return {
    async get(id, { safe = false } = {}) {
      const [product, recipe, productVariationGroups, variations] = await Promise.all([
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
      });
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

        const [validatedRecipe, validatedVariationConfig] = await Promise.all([
          validateProductRecipe(fastify, productType, variations.length > 0, recipe),
          validateProductVariations(fastify, productType, variationGroupIds, variations),
        ]);
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

          if (validatedVariationConfig.variations.length > 0) {
            const createdVariations = validatedVariationConfig.variations.map(
              (variation, index) => ({
                id: generateNanoId(),
                productId: createdProduct.id,
                combinationKey: variation.combinationKey,
                sortOrder: index,
                priceCents: variation.priceCents,
                kitchenName: variation.kitchenName,
                customerDescription: variation.customerDescription,
                kitchenDescription: variation.kitchenDescription,
              }),
            );

            await tx.insert(variationsDB).values(createdVariations);

            await tx.insert(variationSelectionsDB).values(
              createdVariations.flatMap(
                (createdVariation, index) =>
                  validatedVariationConfig.variations[index]?.selections.map((selection) => ({
                    variationId: createdVariation.id,
                    variationGroupId: selection.variationGroupId,
                    variationOptionId: selection.variationOptionId,
                  })) ?? [],
              ),
            );

            const variationRecipes = createdVariations
              .map((createdVariation, index) => ({
                variationId: createdVariation.id,
                recipe: validatedVariationConfig.variations[index]?.recipe ?? null,
              }))
              .filter((variation) => variation.recipe);

            if (variationRecipes.length > 0) {
              await tx.insert(variationRecipesDB).values(
                variationRecipes.map(({ variationId, recipe: variationRecipe }) => ({
                  variationId,
                  description: variationRecipe?.description ?? null,
                })),
              );

              const variationRecipeIngredients = variationRecipes.flatMap(
                ({ variationId, recipe: variationRecipe }) =>
                  variationRecipe?.ingredients.map(({ ingredientId, quantity }) => ({
                    variationId,
                    ingredientId,
                    quantity,
                  })) ?? [],
              );

              if (variationRecipeIngredients.length > 0) {
                await tx.insert(variationRecipeIngredientsDB).values(variationRecipeIngredients);
              }

              const variationRecipeSupplies = variationRecipes.flatMap(
                ({ variationId, recipe: variationRecipe }) =>
                  variationRecipe?.supplies.map(({ supplyId, quantity }) => ({
                    variationId,
                    supplyId,
                    quantity,
                  })) ?? [],
              );

              if (variationRecipeSupplies.length > 0) {
                await tx.insert(variationRecipeSuppliesDB).values(variationRecipeSupplies);
              }
            }
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
  };
}
