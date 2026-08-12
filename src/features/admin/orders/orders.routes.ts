import { userDB } from "@core/db/schemas";
import { adminAuthHandler } from "@core/handlers";
import { forbidden } from "@core/utils";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createRoutes } from "./create";
import {
  adminOrderDetailSchema,
  adminOrderParamsSchema,
  adminOrdersListQuerySchema,
  adminOrdersListResponseSchema,
  type AdminOrderParams,
  type AdminOrdersListQuery,
} from "./orders.read.schemas";
import { paymentAttemptsRoutes } from "./paymentAttempts";

export async function requireGlobalOrderOwner(request: FastifyRequest) {
  const [user] = await request.server.db
    .select({ role: userDB.role })
    .from(userDB)
    .where(eq(userDB.id, request.auth.user.id))
    .limit(1);

  if (user?.role !== "owner") {
    throw forbidden("order.globalOwnerRequired", "Only a global owner can view orders");
  }
}

export async function adminOrdersRoutes(server: FastifyInstance) {
  const readHandlers = [
    adminAuthHandler({ permissions: { orders: ["read"] } }),
    requireGlobalOrderOwner,
  ];

  server.get<{ Querystring: AdminOrdersListQuery }>(
    "/",
    {
      preHandler: readHandlers,
      schema: {
        querystring: adminOrdersListQuerySchema,
        response: { 200: adminOrdersListResponseSchema },
      },
    },
    async (request, reply) =>
      reply.status(200).send(
        await request.server.admin.orders.list({
          ...request.query,
          organizationId: request.auth.member.organizationId,
        }),
      ),
  );

  server.get<{ Params: AdminOrderParams }>(
    "/:orderId",
    {
      preHandler: readHandlers,
      schema: {
        params: adminOrderParamsSchema,
        response: { 200: adminOrderDetailSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(
          await request.server.admin.orders.get(
            request.auth.member.organizationId,
            request.params.orderId,
          ),
        ),
  );

  await server.register(paymentAttemptsRoutes);
  await server.register(createRoutes);
}
