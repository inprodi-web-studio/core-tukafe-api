import { userDB } from "@core/db/schemas";
import { adminAuthHandler } from "@core/handlers";
import { forbidden } from "@core/utils";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
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

export async function requireGlobalOwner(request: FastifyRequest) {
  const [user] = await request.server.db
    .select({ role: userDB.role })
    .from(userDB)
    .where(eq(userDB.id, request.auth.user.id))
    .limit(1);

  if (user?.role !== "owner") {
    throw forbidden("organization.globalOwnerRequired", "Only a global owner can manage branches");
  }
}

export async function adminOrganizationsRoutes(server: FastifyInstance) {
  const globalOwnerHandlers = [adminAuthHandler({ roles: ["owner", "admin"] }), requireGlobalOwner];

  server.get<{ Querystring: ListQuery }>(
    "/",
    {
      preHandler: globalOwnerHandlers,
      schema: { querystring: listQuerySchema, response: { 200: listResponseSchema } },
    },
    listOrganizations,
  );
  server.post<{ Body: CreateBody }>(
    "/",
    {
      preHandler: globalOwnerHandlers,
      schema: { body: createBodySchema, response: { 201: organizationSchema } },
    },
    createOrganization,
  );
  server.patch<{ Params: Params; Body: UpdateBody }>(
    "/:organizationId",
    {
      preHandler: globalOwnerHandlers,
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
    { preHandler: globalOwnerHandlers, schema: { params: paramsSchema } },
    deactivateOrganization,
  );
  server.put<{ Params: Params }>(
    "/:organizationId/restore",
    {
      preHandler: globalOwnerHandlers,
      schema: { params: paramsSchema, response: { 200: organizationSchema } },
    },
    restoreOrganization,
  );
  await server.register(updateLocationRoutes);
}
