import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { listCustomers } from "./customers.controllers";
import { listQuerySchema, listResponseSchema, type CustomerListQuery } from "./customers.schemas";

export async function adminCustomersRoutes(server: FastifyInstance) {
  server.get<{ Querystring: CustomerListQuery }>(
    "/",
    {
      preHandler: [adminAuthHandler({ roles: ["owner", "admin"] })],
      schema: {
        querystring: listQuerySchema,
        response: { 200: listResponseSchema },
      },
    },
    listCustomers,
  );
}
