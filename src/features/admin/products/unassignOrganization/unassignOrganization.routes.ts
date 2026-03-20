import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { unassignOrganization } from "./unassignOrganization.controllers";
import {
  paramsSchema,
  type Params,
  unassignOrganizationResponseSchema,
} from "./unassignOrganization.schemas";

export async function unassignOrganizationRoutes(server: FastifyInstance) {
  server.delete<{
    Params: Params;
  }>(
    "/:productId/organizations/:organizationId",
    {
      preHandler: [adminAuthHandler({ permissions: { products: ["update"] } })],
      schema: {
        params: paramsSchema,
        response: {
          200: unassignOrganizationResponseSchema,
        },
      },
    },
    unassignOrganization,
  );
}
