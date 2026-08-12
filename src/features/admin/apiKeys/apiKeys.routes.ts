import { userDB } from "@core/db/schemas";
import { adminAuthHandler } from "@core/handlers";
import { forbidden } from "@core/utils";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  apiKeyParamsSchema,
  listQuerySchema,
  listResponseSchema,
  type ApiKeyParams,
  type ListQuery,
} from "./apiKeys.schemas";
import { createRoutes } from "./create";

export async function requireGlobalOwner(request: FastifyRequest) {
  const [user] = await request.server.db
    .select({ role: userDB.role })
    .from(userDB)
    .where(eq(userDB.id, request.auth.user.id))
    .limit(1);

  if (user?.role !== "owner") {
    throw forbidden("apiKey.globalOwnerRequired", "Only a global owner can manage API keys");
  }
}

export async function adminApiKeysRoutes(server: FastifyInstance) {
  server.addHook("preHandler", adminAuthHandler());
  server.addHook("preHandler", requireGlobalOwner);

  server.get<{ Querystring: ListQuery }>(
    "/",
    {
      schema: {
        querystring: listQuerySchema,
        response: { 200: listResponseSchema },
      },
    },
    async (request, reply) =>
      reply.status(200).send(await request.server.admin.apiKeys.list(request.query)),
  );

  await server.register(createRoutes);

  server.delete<{ Params: ApiKeyParams }>(
    "/:apiKeyId",
    { schema: { params: apiKeyParamsSchema } },
    async (request, reply) => {
      await request.server.admin.apiKeys.revoke(request.params.apiKeyId);
      return reply.status(204).send();
    },
  );
}
