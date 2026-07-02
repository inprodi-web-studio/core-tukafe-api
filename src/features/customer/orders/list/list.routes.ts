import { customerAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { listCustomerOrders } from "./list.controllers";
import {
  listCustomerOrdersQuerySchema,
  listCustomerOrdersResponseSchema,
  type ListCustomerOrdersQuery,
} from "./list.schemas";

export async function listRoutes(server: FastifyInstance) {
  server.get<{
    Querystring: ListCustomerOrdersQuery;
  }>(
    "/",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        querystring: listCustomerOrdersQuerySchema,
        response: {
          200: listCustomerOrdersResponseSchema,
        },
      },
    },
    listCustomerOrders,
  );
}
