import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { list } from "./list.controllers";
import { listQueryParamsSchema, listResponseSchema, type ListQueryParams } from "./list.schemas";

export async function listRoutes(server: FastifyInstance) {
  server.get<{ Querystring: ListQueryParams }>(
    "/",
    {
      preHandler: [adminAuthHandler({ permissions: { variationGroups: ["read"] } })],
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
