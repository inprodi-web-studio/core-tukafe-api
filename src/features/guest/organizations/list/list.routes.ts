import { apiKeyAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { list } from "./list.controllers";
import { listResponseSchema } from "./list.schemas";

export async function listRoutes(server: FastifyInstance) {
  server.get(
    "/",
    {
      preHandler: [apiKeyAuthHandler()],
      schema: {
        response: {
          200: listResponseSchema,
        },
      },
    },
    list,
  );
}
