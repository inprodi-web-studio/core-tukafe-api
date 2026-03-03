import { productTaxDB, productsDB, recipeIngredientsDB, recipesDB, recipeSuppliesDB } from "@core/db/schemas";
import { conflict, generateNanoId, getPgError, notFound } from "@core/utils";
import type { FastifyInstance } from "fastify";
import { mapProductResponse, normalizeProductInput, validateProductRecipe } from "./products.helpers";
import type { AdminProductsService } from "./products.types";

export function adminProductsService(fastify: FastifyInstance): AdminProductsService {
  return {
    async get(id, { safe = false } = {}) {
      const product = await fastify.db.query.productsDB.findFirst({
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
      });

      if (!product && !safe) {
        throw notFound("product.notFound", "The product was not found");
      }

      if (!product) {
        return null;
      }

       const recipe = await fastify.db.query.recipesDB.findFirst({
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
      });

      return mapProductResponse({
        ...product,
        recipe: recipe ?? null,
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

        const validatedRecipe = await validateProductRecipe(fastify, productType, recipe);

        const createdProductId = await fastify.db.transaction(async (tx) => {
          const [createdProduct] = await tx
            .insert(productsDB)
            .values({
              id: generateNanoId(),
              name,
              kitchenName,
              priceCents,
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

        throw error;
      }
    },
  };
}
