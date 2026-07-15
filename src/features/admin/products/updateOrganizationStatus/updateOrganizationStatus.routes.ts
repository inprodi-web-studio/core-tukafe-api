import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { updateOrganizationStatus } from "./updateOrganizationStatus.controllers";
import {
  bodySchema,
  paramsSchema,
  responseSchema,
  type Body,
  type Params,
} from "./updateOrganizationStatus.schemas";

export async function updateOrganizationStatusRoutes(server: FastifyInstance) {
  server.put<{ Params: Params; Body: Body }>(
    "/:productId/organization-status",
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
    updateOrganizationStatus,
  );
}
