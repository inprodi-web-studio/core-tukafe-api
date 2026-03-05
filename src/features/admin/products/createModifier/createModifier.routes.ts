import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { createModifier } from "./createModifier.controllers";
import {
  createModifierBodySchema,
  createModifierResponseSchema,
  paramsSchema,
  type CreateModifierBody,
  type Params,
} from "./createModifier.schemas";

export async function createModifierRoutes(server: FastifyInstance) {
  server.post<{
    Params: Params;
    Body: CreateModifierBody;
  }>(
    "/:productId/modifiers",
    {
      preHandler: [adminAuthHandler({ permissions: { products: ["update"] } })],
      schema: {
        params: paramsSchema,
        body: createModifierBodySchema,
        response: {
          201: createModifierResponseSchema,
        },
      },
    },
    createModifier,
  );
}
