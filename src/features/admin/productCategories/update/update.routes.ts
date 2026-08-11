import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { update } from "./update.controllers";
import {
  paramsSchema,
  updateBodySchema,
  updateResponseSchema,
  type Params,
  type UpdateBody,
} from "./update.schemas";

export async function updateRoutes(server: FastifyInstance) {
  server.patch<{ Params: Params; Body: UpdateBody }>(
    "/:categoryId",
    {
      preHandler: [
        adminAuthHandler({
          roles: ["owner", "admin"],
          permissions: { productCategories: ["update"] },
        }),
      ],
      schema: {
        params: paramsSchema,
        body: updateBodySchema,
        response: {
          200: updateResponseSchema,
        },
      },
    },
    update,
  );
}
