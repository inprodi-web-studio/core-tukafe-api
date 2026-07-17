import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params } from "./getById.schemas";

export async function getById(request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) {
  const coupon = await request.server.admin.coupons.getById(
    request.params.couponId,
    request.auth.member.organizationId,
  );

  return reply.status(200).send(coupon);
}
