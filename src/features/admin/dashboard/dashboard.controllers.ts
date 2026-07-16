import type { FastifyReply, FastifyRequest } from "fastify";
import type { DashboardQuery } from "./dashboard.schemas";

export async function getDashboard(
  request: FastifyRequest<{ Querystring: DashboardQuery }>,
  reply: FastifyReply,
) {
  const dashboard = await request.server.admin.dashboard.get({
    ...request.query,
    userId: request.auth.user.id,
  });

  return reply.status(200).send(dashboard);
}
