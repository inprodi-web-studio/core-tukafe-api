import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { create } from "./create.controllers";
import { createBodySchema, createResponseSchema } from "./create.schemas";

export async function createRoutes(server: FastifyInstance) {
  server.post(
    "/",
    {
      preHandler: [adminAuthHandler({ permissions: { taxes: ["create"] } })],
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
