import { adminAuthHandler } from "@core/handlers";
import type { FastifyInstance } from "fastify";
import { updateLocationRoutes } from "./updateLocation";
import {
  createOrganization,
  deactivateOrganization,
  listOrganizations,
  restoreOrganization,
  updateOrganization,
} from "./organizations.controllers";
import {
  createBodySchema,
  listQuerySchema,
  listResponseSchema,
  organizationSchema,
  paramsSchema,
  updateBodySchema,
  type CreateBody,
  type ListQuery,
  type Params,
  type UpdateBody,
} from "./organizations.schemas";

export async function adminOrganizationsRoutes(server: FastifyInstance) {
  const canManageOrganizations = adminAuthHandler({ roles: ["owner", "admin"] });

  server.get<{ Querystring: ListQuery }>(
    "/",
    {
      preHandler: [canManageOrganizations],
      schema: { querystring: listQuerySchema, response: { 200: listResponseSchema } },
    },
    listOrganizations,
  );
  server.post<{ Body: CreateBody }>(
    "/",
    {
      preHandler: [canManageOrganizations],
      schema: { body: createBodySchema, response: { 201: organizationSchema } },
    },
    createOrganization,
  );
  server.patch<{ Params: Params; Body: UpdateBody }>(
    "/:organizationId",
    {
      preHandler: [canManageOrganizations],
      schema: {
        params: paramsSchema,
        body: updateBodySchema,
        response: { 200: organizationSchema },
      },
    },
    updateOrganization,
  );
  server.delete<{ Params: Params }>(
    "/:organizationId",
    { preHandler: [canManageOrganizations], schema: { params: paramsSchema } },
    deactivateOrganization,
  );
  server.put<{ Params: Params }>(
    "/:organizationId/restore",
    {
      preHandler: [canManageOrganizations],
      schema: { params: paramsSchema, response: { 200: organizationSchema } },
    },
    restoreOrganization,
  );
  await server.register(updateLocationRoutes);
}
