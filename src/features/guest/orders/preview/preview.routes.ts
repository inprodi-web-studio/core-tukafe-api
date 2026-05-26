import { apiKeyAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { preview } from "./preview.controllers";
import { previewBodySchema, previewResponseSchema, type PreviewBody } from "./preview.schemas";

export async function previewRoutes(server: FastifyInstance) {
  server.post<{ Body: PreviewBody }>(
    "/",
    {
      preHandler: [apiKeyAuthHandler()],
      schema: {
        body: previewBodySchema,
        response: {
          200: previewResponseSchema,
        },
      },
    },
    preview,
  );
}
