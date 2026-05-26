import { customerAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { getCurrentCustomer } from "./me.controllers";
import { currentCustomerResponseSchema } from "./me.schemas";

export async function meRoutes(server: FastifyInstance) {
  server.get(
    "/",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        response: {
          200: currentCustomerResponseSchema,
        },
      },
    },
    getCurrentCustomer,
  );
}
