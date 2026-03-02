import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { create } from "./create.controllers";

export async function createRoutes(server: FastifyInstance) {
  server.post(
    "/",
    {
      preHandler: [adminAuthHandler({ permissions: { products: ["create"] } })],
      schema: {
        // body: createBodySchema,
        // response : "",
      },
    },
    create,
  );
}
