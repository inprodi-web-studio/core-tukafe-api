import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { updateStatus } from "./updateStatus.controllers";
import {
  paramsSchema,
  updateStatusBodySchema,
  updateStatusResponseSchema,
  type Params,
  type UpdateStatusBody,
} from "./updateStatus.schemas";

export async function updateStatusRoutes(server: FastifyInstance) {
  server.patch<{ Params: Params; Body: UpdateStatusBody }>(
    "/:couponId/status",
    {
      preHandler: [
        adminAuthHandler({ roles: ["owner", "admin"], permissions: { coupons: ["update"] } }),
      ],
      schema: {
        params: paramsSchema,
        body: updateStatusBodySchema,
        response: {
          200: updateStatusResponseSchema,
        },
      },
    },
    updateStatus,
  );
}
