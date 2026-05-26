import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params, UpdateBody } from "./update.schemas";

export async function update(
  request: FastifyRequest<{ Params: Params; Body: UpdateBody }>,
  reply: FastifyReply,
) {
  const updatedCoupon = await request.server.admin.coupons.update(
    request.params.couponId,
    request.body,
  );

  return reply.status(200).send(updatedCoupon);
}
