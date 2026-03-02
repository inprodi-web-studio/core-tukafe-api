import { productsDB } from "@core/db/schemas";
import { conflict, generateNanoId, getPgError, notFound } from "@core/utils";
import type { FastifyInstance } from "fastify";
import { normalizeProductInput } from "./products.helpers";
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
        },
      });

      if (!product && !safe) {
        throw notFound("product.notFound", "The product category was not found");
      }

      if (!product) {
        return null;
      }

      return product;
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
      } = normalizeProductInput(input);

      try {
        await fastify.admin.units.get(unitId);

        if (categoryId) {
          await fastify.admin.productCategories.get(categoryId);
        }

        const [createdProduct] = await fastify.db
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

        const product = await fastify.admin.products.get(createdProduct.id);

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
