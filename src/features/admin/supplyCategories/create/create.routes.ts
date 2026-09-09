import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { create } from "./create.controllers";
import { createBodySchema, createResponseSchema, type CreateBody } from "./create.schemas";

export async function createRoutes(server: FastifyInstance) {
  server.post<{ Body: CreateBody }>(
    "/",
    {
      preHandler: [adminAuthHandler({ permissions: { supplyCategories: ["create"] } })],
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
