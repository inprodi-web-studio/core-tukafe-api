import type { FastifyReply, FastifyRequest } from "fastify";
import type { QueryParams } from "./list.schemas";

export async function list(
  request: FastifyRequest<{ Querystring: QueryParams }>,
  reply: FastifyReply,
) {
  const { member } = request.auth;

  const workOrders = await request.server.admin.workOrders.list({
    ...request.query,
    organizationId: member.organizationId,
  });

  return reply.status(200).send(workOrders);
}
