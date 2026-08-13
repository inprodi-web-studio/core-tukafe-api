import { adminAuthHandler } from "@core/handlers";
import { requireGlobalInventoryOwner } from "@features/admin/inventory/inventory.access";
import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";
import { createResponseSchema } from "./create/create.schemas";
import {
  ingredientCategoryParamsSchema,
  updateIngredientCategoryBodySchema,
  type IngredientCategoryParams,
  type UpdateIngredientCategoryBody,
} from "./ingredientCategories.schemas";
import { listRoutes } from "./list";

export async function adminIngredientCategoriesRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
  await server.register(createRoutes);

  server.patch<{ Params: IngredientCategoryParams; Body: UpdateIngredientCategoryBody }>(
    "/:categoryId",
    {
      preHandler: [adminAuthHandler(), requireGlobalInventoryOwner],
      schema: {
        params: ingredientCategoryParamsSchema,
        body: updateIngredientCategoryBodySchema,
        response: { 200: createResponseSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(
          await request.server.admin.ingredientCategories.update(
            request.params.categoryId,
            request.body,
          ),
        ),
  );

  server.delete<{ Params: IngredientCategoryParams }>(
    "/:categoryId",
    {
      preHandler: [adminAuthHandler(), requireGlobalInventoryOwner],
      schema: { params: ingredientCategoryParamsSchema },
    },
    async (request, reply) => {
      await request.server.admin.ingredientCategories.remove(request.params.categoryId);
      return reply.status(204).send();
    },
  );
}
