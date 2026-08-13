import { adminAuthHandler } from "@core/handlers";
import { requireGlobalInventoryOwner } from "@features/admin/inventory/inventory.access";
import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";
import { createResponseSchema } from "./create/create.schemas";
import { listRoutes } from "./list";
import {
  supplyCategoryParamsSchema,
  updateSupplyCategoryBodySchema,
  type SupplyCategoryParams,
  type UpdateSupplyCategoryBody,
} from "./supplyCategories.schemas";

export async function adminSupplyCategoriesRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
  await server.register(createRoutes);

  server.patch<{ Params: SupplyCategoryParams; Body: UpdateSupplyCategoryBody }>(
    "/:categoryId",
    {
      preHandler: [adminAuthHandler(), requireGlobalInventoryOwner],
      schema: {
        params: supplyCategoryParamsSchema,
        body: updateSupplyCategoryBodySchema,
        response: { 200: createResponseSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(
          await request.server.admin.supplyCategories.update(
            request.params.categoryId,
            request.body,
          ),
        ),
  );

  server.delete<{ Params: SupplyCategoryParams }>(
    "/:categoryId",
    {
      preHandler: [adminAuthHandler(), requireGlobalInventoryOwner],
      schema: { params: supplyCategoryParamsSchema },
    },
    async (request, reply) => {
      await request.server.admin.supplyCategories.remove(request.params.categoryId);
      return reply.status(204).send();
    },
  );
}
