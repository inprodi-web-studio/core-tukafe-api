import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { remove } from "./remove.controllers";
import { paramsSchema, type Params } from "./remove.schemas";

export async function removeRoutes(server: FastifyInstance) {
  server.delete<{ Params: Params }>(
    "/:categoryId",
    {
      preHandler: [
        adminAuthHandler({
          roles: ["owner", "admin"],
          permissions: { productCategories: ["delete"] },
        }),
      ],
      schema: { params: paramsSchema },
    },
    remove,
  );
}
