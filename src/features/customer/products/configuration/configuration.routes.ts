import { customerAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { getConfiguration } from "./configuration.controllers";
import { configurationResponseSchema, paramsSchema, type Params } from "./configuration.schemas";

export async function configurationRoutes(server: FastifyInstance) {
  server.get<{ Params: Params }>(
    "/:productId/configuration",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        params: paramsSchema,
        response: {
          200: configurationResponseSchema,
        },
      },
    },
    getConfiguration,
  );
}
