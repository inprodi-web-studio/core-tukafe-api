import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params } from "./complete.schemas";

export async function complete(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
  const { member, user } = request.auth;

  const workOrder = await request.server.admin.workOrders.complete({
    organizationId: member.organizationId,
    workOrderId: request.params.workOrderId,
    completedByUserId: user.id,
  });

  return reply.status(200).send(workOrder);
}
