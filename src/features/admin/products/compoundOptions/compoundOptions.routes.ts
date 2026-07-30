import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { listCompoundOptions } from "./compoundOptions.controllers";
import {
  paramsSchema,
  querySchema,
  responseSchema,
  type Params,
  type Query,
} from "./compoundOptions.schemas";

export async function compoundOptionsRoutes(server: FastifyInstance) {
  server.get<{ Params: Params; Querystring: Query }>(
    "/:productId/compound-options",
    {
      preHandler: [
        adminAuthHandler({
          roles: ["owner", "admin"],
          permissions: { products: ["read"] },
        }),
      ],
      schema: {
        params: paramsSchema,
        querystring: querySchema,
        response: { 200: responseSchema },
      },
    },
    listCompoundOptions,
  );
}
