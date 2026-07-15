import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { updateFeatured } from "./updateFeatured.controllers";
import {
  bodySchema,
  paramsSchema,
  responseSchema,
  type Body,
  type Params,
} from "./updateFeatured.schemas";

export async function updateFeaturedRoutes(server: FastifyInstance) {
  server.put<{ Params: Params; Body: Body }>(
    "/:productId/featured",
    {
      preHandler: [
        adminAuthHandler({
          permissions: { products: ["update"] },
          roles: ["owner", "admin"],
        }),
      ],
      schema: {
        params: paramsSchema,
        body: bodySchema,
        response: { 200: responseSchema },
      },
    },
    updateFeatured,
  );
}
