import { adminAuthHandler } from "@core/handlers";
import { listQueryParamsSchema } from "@core/utils";
import type { FastifyInstance } from "fastify";
import { list } from "./list.controllers";
import { listResponseSchema } from "./list.schemas";

export async function listRoutes(server: FastifyInstance) {
  server.get(
    "/",
    {
      preHandler: [adminAuthHandler({ permissions: { suppliers: ["read"] } })],
      schema: {
        querystring: listQueryParamsSchema,
        response: {
          200: listResponseSchema,
        },
      },
    },
    list,
  );
}
