import { apiKeyAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { findOrCreate } from "./findOrCreate.controllers";
import {
  findOrCreateBodySchema,
  findOrCreateResponseSchema,
  type FindOrCreateBody,
} from "./findOrCreate.schemas";

export async function findOrCreateRoutes(server: FastifyInstance) {
  server.post<{ Body: FindOrCreateBody }>(
    "/find-or-create",
    {
      preHandler: [apiKeyAuthHandler()],
      schema: {
        body: findOrCreateBodySchema,
        response: {
          200: findOrCreateResponseSchema,
        },
      },
    },
    findOrCreate,
  );
}
