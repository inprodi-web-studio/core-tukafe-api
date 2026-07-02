import { customerAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { getCustomerOrder } from "./detail.controllers";
import {
  getCustomerOrderParamsSchema,
  getCustomerOrderResponseSchema,
  type GetCustomerOrderParams,
} from "./detail.schemas";

export async function detailRoutes(server: FastifyInstance) {
  server.get<{ Params: GetCustomerOrderParams }>(
    "/:orderId",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        params: getCustomerOrderParamsSchema,
        response: {
          200: getCustomerOrderResponseSchema,
        },
      },
    },
    getCustomerOrder,
  );
}
