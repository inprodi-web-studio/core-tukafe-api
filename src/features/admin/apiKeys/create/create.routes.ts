import type { FastifyInstance } from "fastify";
import { create } from "./create.controllers";
import { createBodySchema, createResponseSchema } from "./create.schemas";

export async function createRoutes(server: FastifyInstance) {
  server.post(
    "/",
    {
      schema: {
        body: createBodySchema,
        response: {
          201: createResponseSchema,
        },
      },
    },
    create,
  );
}
