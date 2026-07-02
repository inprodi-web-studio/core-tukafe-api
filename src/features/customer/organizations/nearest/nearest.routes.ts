import { customerAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { nearest } from "./nearest.controllers";
import { nearestQuerySchema, nearestResponseSchema, type NearestQuery } from "./nearest.schemas";

export async function nearestRoutes(server: FastifyInstance) {
  server.get<{
    Querystring: NearestQuery;
  }>(
    "/nearest",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        querystring: nearestQuerySchema,
        response: {
          200: nearestResponseSchema,
        },
      },
    },
    nearest,
  );
}
