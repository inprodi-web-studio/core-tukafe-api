import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { complete } from "./complete.controllers";
import { completeResponseSchema, paramsSchema, type Params } from "./complete.schemas";

export async function completeRoutes(server: FastifyInstance) {
  server.patch<{ Params: Params }>(
    "/:workOrderId/complete",
    {
      preHandler: [adminAuthHandler({ permissions: { orders: ["update"] } })],
      schema: {
        params: paramsSchema,
        response: {
          200: completeResponseSchema,
        },
      },
    },
    complete,
  );
}
