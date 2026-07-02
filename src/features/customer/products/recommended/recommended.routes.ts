import { customerAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { listResponseSchema } from "../list/list.schemas";
import { listRecommended } from "./recommended.controllers";
import { recommendedQuerySchema, type RecommendedQuery } from "./recommended.schemas";

export async function recommendedRoutes(server: FastifyInstance) {
  server.get<{
    Querystring: RecommendedQuery;
  }>(
    "/recommended",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        querystring: recommendedQuerySchema,
        response: {
          200: listResponseSchema,
        },
      },
    },
    listRecommended,
  );
}
