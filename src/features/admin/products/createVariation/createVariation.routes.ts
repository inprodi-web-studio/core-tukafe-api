import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { createVariation } from "./createVariation.controllers";
import {
  createVariationBodySchema,
  createVariationResponseSchema,
  paramsSchema,
  type CreateVariationBody,
  type Params,
} from "./createVariation.schemas";

export async function createVariationRoutes(server: FastifyInstance) {
  server.post<{
    Params: Params;
    Body: CreateVariationBody;
  }>(
    "/:productId/variations",
    {
      preHandler: [adminAuthHandler({ permissions: { products: ["update"] } })],
      schema: {
        params: paramsSchema,
        body: createVariationBodySchema,
        response: {
          201: createVariationResponseSchema,
        },
      },
    },
    createVariation,
  );
}
