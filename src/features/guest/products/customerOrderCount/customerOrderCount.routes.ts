import { apiKeyAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { getCustomerOrderCount } from "./customerOrderCount.controllers";
import {
  customerOrderCountResponseSchema,
  paramsSchema,
  querystringSchema,
  type Params,
  type Querystring,
} from "./customerOrderCount.schemas";

export async function customerOrderCountRoutes(server: FastifyInstance) {
  server.get<{ Params: Params; Querystring: Querystring }>(
    "/:productId/customer-order-count",
    {
      preHandler: [apiKeyAuthHandler()],
      schema: {
        params: paramsSchema,
        querystring: querystringSchema,
        response: {
          200: customerOrderCountResponseSchema,
        },
      },
    },
    getCustomerOrderCount,
  );
}
