import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateBody } from "./create.schemas";

export async function create(request: FastifyRequest<{ Body: CreateBody }>, reply: FastifyReply) {
  const { member } = request.auth;

  const createdOrder = await request.server.admin.orders.create({
    organizationId: member.organizationId,
    ...request.body,
  });

  return reply.status(201).send(createdOrder);
}
