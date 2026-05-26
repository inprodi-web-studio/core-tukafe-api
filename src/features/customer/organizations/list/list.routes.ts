import { customerAuthHandler } from "@core/handlers";
import { listResponseSchema } from "@features/guest/organizations/list/list.schemas";
import type { FastifyInstance } from "fastify";
import { list } from "./list.controllers";

export async function listRoutes(server: FastifyInstance) {
  server.get(
    "/",
    {
      preHandler: [customerAuthHandler()],
      schema: {
        response: {
          200: listResponseSchema,
        },
      },
    },
    list,
  );
}
