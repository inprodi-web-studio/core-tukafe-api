import { ingredientsDB } from "@core/db/schemas";
import { conflict, generateNanoId, getPgError, notFound } from "@core/utils";
import type { FastifyInstance } from "fastify";
import { normalizeIngredientInput } from "./ingredients.helpers";
import type { AdminIngredientsService } from "./ingredients.types";

export function adminIngredientsService(fastify: FastifyInstance): AdminIngredientsService {
  return {
    async get(id, { safe = false } = {}) {
      const ingredient = await fastify.db.query.ingredientsDB.findFirst({
        where(ingredientTable, { eq }) {
          return eq(ingredientTable.id, id);
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

      if (!ingredient && !safe) {
        throw notFound("ingredient.notFound", "The ingredient was not found");
      }

      if (!ingredient) {
        return null;
      }

      return ingredient;
    },

    async create(input) {
      const { name, categoryId, baseCostCents, description, unitId } =
        normalizeIngredientInput(input);

      try {
        await fastify.admin.units.get(unitId);

        await fastify.admin.ingredientCategories.get(categoryId);

        const [createdIngredient] = await fastify.db
          .insert(ingredientsDB)
          .values({
            id: generateNanoId(),
            name,
            categoryId,
            baseCostCents,
            description,
            unitId,
          })
          .returning();

        if (!createdIngredient) {
          throw new Error("Faile to create ingredient");
        }

        const ingredient = await fastify.admin.ingredients.get(createdIngredient.id);

        if (!ingredient) {
          throw new Error("Failed to retrieve created ingredient");
        }

        return ingredient;
      } catch (error) {
        const pgError = getPgError(error);

        if (pgError?.code === "23505" && pgError.constraint === "ingredient_name_active_unique") {
          throw conflict("ingredient.duplicatedName", "A ingredient with this name already exists");
        }

        throw error;
      }
    },
  };
}
