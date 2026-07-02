import { customerAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { listResponseSchema } from "../list/list.schemas";
import { listPopular } from "./popular.controllers";
import { popularQuerySchema, type PopularQuery } from "./popular.schemas";

export async function popularRoutes(server: FastifyInstance) {
  server.get<{
    Querystring: PopularQuery;
  }>(
    "/popular",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        querystring: popularQuerySchema,
        response: {
          200: listResponseSchema,
        },
      },
    },
    listPopular,
  );
}
