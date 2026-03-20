import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { assignOrganization } from "./assignOrganization.controllers";
import {
  assignOrganizationResponseSchema,
  paramsSchema,
  type Params,
} from "./assignOrganization.schemas";

export async function assignOrganizationRoutes(server: FastifyInstance) {
  server.post<{
    Params: Params;
  }>(
    "/:productId/organizations/:organizationId",
    {
      preHandler: [adminAuthHandler({ permissions: { products: ["update"] } })],
      schema: {
        params: paramsSchema,
        response: {
          201: assignOrganizationResponseSchema,
        },
      },
    },
    assignOrganization,
  );
}
