import { customerAuthHandler } from "@core/handlers";
import {
  listResponseSchema,
  listQuerySchema,
  type ListQuery,
} from "@features/guest/productCategories/list/list.schemas";
import type { FastifyInstance } from "fastify";
import { list } from "./list.controllers";

export async function listRoutes(server: FastifyInstance) {
  server.get<{ Querystring: ListQuery }>(
    "/",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        querystring: listQuerySchema,
        response: {
          200: listResponseSchema,
        },
      },
    },
    list,
  );
}
