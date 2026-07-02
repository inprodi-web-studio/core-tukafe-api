import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { updateModifierOptions } from "./updateModifierOptions.controllers";
import {
  paramsSchema,
  updateModifierOptionsBodySchema,
  updateModifierOptionsResponseSchema,
  type Params,
  type UpdateModifierOptionsBody,
} from "./updateModifierOptions.schemas";

export async function updateModifierOptionsRoutes(server: FastifyInstance) {
  server.patch<{
    Params: Params;
    Body: UpdateModifierOptionsBody;
  }>(
    "/:productId/modifiers/:modifierId/options",
    {
      preHandler: [adminAuthHandler({ permissions: { products: ["update"] } })],
      schema: {
        params: paramsSchema,
        body: updateModifierOptionsBodySchema,
        response: {
          200: updateModifierOptionsResponseSchema,
        },
      },
    },
    updateModifierOptions,
  );
}
