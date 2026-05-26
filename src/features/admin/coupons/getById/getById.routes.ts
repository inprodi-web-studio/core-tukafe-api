import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { getById } from "./getById.controllers";
import { getByIdResponseSchema, paramsSchema, type Params } from "./getById.schemas";

export async function getByIdRoutes(server: FastifyInstance) {
  server.get<{ Params: Params }>(
    "/:couponId",
    {
      preHandler: [adminAuthHandler({ permissions: { coupons: ["read"] } })],
      schema: {
        params: paramsSchema,
        response: {
          200: getByIdResponseSchema,
        },
      },
    },
    getById,
  );
}
