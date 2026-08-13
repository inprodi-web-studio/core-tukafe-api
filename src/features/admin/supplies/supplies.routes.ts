import { adminAuthHandler } from "@core/handlers";
import { requireGlobalInventoryOwner } from "@features/admin/inventory/inventory.access";
import type { FastifyInstance } from "fastify";
import { createRoutes } from "./create";
import { createResponseSchema } from "./create/create.schemas";
import { listRoutes } from "./list";
import {
  supplyParamsSchema,
  updateSupplyBodySchema,
  type SupplyParams,
  type UpdateSupplyBody,
} from "./supplies.schemas";

export async function adminSuppliesRoutes(server: FastifyInstance) {
  await server.register(listRoutes);
  await server.register(createRoutes);

  server.get<{ Params: SupplyParams }>(
    "/:supplyId",
    {
      preHandler: [adminAuthHandler({ permissions: { supplies: ["read"] } })],
      schema: { params: supplyParamsSchema, response: { 200: createResponseSchema } },
    },
    async (request, reply) =>
      reply.status(200).send(await request.server.admin.supplies.get(request.params.supplyId)),
  );

  server.patch<{ Params: SupplyParams; Body: UpdateSupplyBody }>(
    "/:supplyId",
    {
      preHandler: [adminAuthHandler(), requireGlobalInventoryOwner],
      schema: {
        params: supplyParamsSchema,
        body: updateSupplyBodySchema,
        response: { 200: createResponseSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(await request.server.admin.supplies.update(request.params.supplyId, request.body)),
  );

  server.delete<{ Params: SupplyParams }>(
    "/:supplyId",
    {
      preHandler: [adminAuthHandler(), requireGlobalInventoryOwner],
      schema: { params: supplyParamsSchema },
    },
    async (request, reply) => {
      await request.server.admin.supplies.remove(request.params.supplyId);
      return reply.status(204).send();
    },
  );
}
