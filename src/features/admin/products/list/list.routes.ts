import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { list } from "./list.controllers";
import { listQuerySchema, listResponseSchema, type ListQuery } from "./list.schemas";

export async function listRoutes(server: FastifyInstance) {
  server.get<{ Querystring: ListQuery }>(
    "/",
    {
      preHandler: [
        adminAuthHandler({
          roles: ["owner", "admin"],
          permissions: { products: ["read"] },
        }),
      ],
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
