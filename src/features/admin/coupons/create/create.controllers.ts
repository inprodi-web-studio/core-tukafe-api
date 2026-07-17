import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateBody } from "./create.schemas";

export async function create(request: FastifyRequest<{ Body: CreateBody }>, reply: FastifyReply) {
  const createdCoupon = await request.server.admin.coupons.create({
    ...request.body,
    creatorUserId: request.auth.user.id,
  });

  return reply.status(201).send(createdCoupon);
}
