import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { list } from "./list.controllers";
import { listResponseSchema, querySchema, type QueryParams } from "./list.schemas";

export async function listRoutes(server: FastifyInstance) {
  server.get<{ Querystring: QueryParams }>(
    "/",
    {
      preHandler: [
        adminAuthHandler({ roles: ["owner", "admin"], permissions: { coupons: ["read"] } }),
      ],
      schema: {
        querystring: querySchema,
        response: {
          200: listResponseSchema,
        },
      },
    },
    list,
  );
}
