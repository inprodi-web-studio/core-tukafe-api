import { adminAuthHandler } from "@core/handlers";
import { requireGlobalInventoryOwner } from "@features/admin/inventory/inventory.access";
import type { FastifyInstance } from "fastify";
import { create } from "./create.controllers";
import { createBodySchema, createResponseSchema } from "./create.schemas";
import type { CreateBody } from "./create.schemas";

export async function createRoutes(server: FastifyInstance) {
  server.post<{ Body: CreateBody }>(
    "/",
    {
      preHandler: [adminAuthHandler(), requireGlobalInventoryOwner],
      schema: {
        body: createBodySchema,
        response: {
          201: createResponseSchema,
        },
      },
    },
    create,
  );
}
