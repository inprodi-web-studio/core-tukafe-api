import { customerAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { getCustomerOrderCount } from "./customerOrderCount.controllers";
import {
  customerOrderCountResponseSchema,
  paramsSchema,
  type Params,
} from "./customerOrderCount.schemas";

export async function customerOrderCountRoutes(server: FastifyInstance) {
  server.get<{ Params: Params }>(
    "/:productId/customer-order-count",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        params: paramsSchema,
        response: {
          200: customerOrderCountResponseSchema,
        },
      },
    },
    getCustomerOrderCount,
  );
}
