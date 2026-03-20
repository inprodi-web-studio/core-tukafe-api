import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateBody } from "./create.schemas";

export async function create(request: FastifyRequest<{ Body: CreateBody }>, reply: FastifyReply) {
  const { user } = request.customerAuth;

  const createdOrder = await request.server.customer.orders.create({
    ...request.body,
    customerId: user.id,
  });

  return reply.status(201).send(createdOrder);
}
