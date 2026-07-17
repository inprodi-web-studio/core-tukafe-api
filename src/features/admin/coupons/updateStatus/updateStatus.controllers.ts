import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params, UpdateStatusBody } from "./updateStatus.schemas";

export async function updateStatus(
  request: FastifyRequest<{ Params: Params; Body: UpdateStatusBody }>,
  reply: FastifyReply,
) {
  const updatedCoupon = await request.server.admin.coupons.updateStatus(
    request.params.couponId,
    request.auth.member.organizationId,
    request.body,
  );

  return reply.status(200).send(updatedCoupon);
}
