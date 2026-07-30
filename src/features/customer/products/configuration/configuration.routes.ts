import { customerAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { getConfiguration } from "./configuration.controllers";
import {
  configurationResponseSchema,
  paramsSchema,
  querySchema,
  type Params,
  type Query,
} from "./configuration.schemas";

export async function configurationRoutes(server: FastifyInstance) {
  server.get<{ Params: Params; Querystring: Query }>(
    "/:productId/configuration",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        params: paramsSchema,
        querystring: querySchema,
        response: {
          200: configurationResponseSchema,
        },
      },
    },
    getConfiguration,
  );
}
