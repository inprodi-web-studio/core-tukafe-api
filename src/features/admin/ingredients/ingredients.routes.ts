import { adminAuthHandler } from "@core/handlers";
import { requireGlobalInventoryOwner } from "@features/admin/inventory/inventory.access";
import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";
import { createResponseSchema } from "./create/create.schemas";
import {
  ingredientParamsSchema,
  updateIngredientBodySchema,
  type IngredientParams,
  type UpdateIngredientBody,
} from "./ingredients.schemas";
import { listRoutes } from "./list";

export async function adminIngredientsRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
  await server.register(createRoutes);

  server.get<{ Params: IngredientParams }>(
    "/:ingredientId",
    {
      preHandler: [adminAuthHandler({ permissions: { ingredients: ["read"] } })],
      schema: { params: ingredientParamsSchema, response: { 200: createResponseSchema } },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(await request.server.admin.ingredients.get(request.params.ingredientId)),
  );

  server.patch<{ Params: IngredientParams; Body: UpdateIngredientBody }>(
    "/:ingredientId",
    {
      preHandler: [adminAuthHandler(), requireGlobalInventoryOwner],
      schema: {
        params: ingredientParamsSchema,
        body: updateIngredientBodySchema,
        response: { 200: createResponseSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(
          await request.server.admin.ingredients.update(request.params.ingredientId, request.body),
        ),
  );

  server.delete<{ Params: IngredientParams }>(
    "/:ingredientId",
    {
      preHandler: [adminAuthHandler(), requireGlobalInventoryOwner],
      schema: { params: ingredientParamsSchema },
    },
    async (request, reply) => {
      await request.server.admin.ingredients.remove(request.params.ingredientId);
      return reply.status(204).send();
    },
  );
}
