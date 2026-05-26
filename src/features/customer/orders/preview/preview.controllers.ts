import type { FastifyReply, FastifyRequest } from "fastify";
import type { PreviewBody } from "./preview.schemas";

export async function preview(request: FastifyRequest<{ Body: PreviewBody }>, reply: FastifyReply) {
  const { customer } = request.customerAuth;

  const previewResult = await request.server.customer.orders.preview({
    ...request.body,
    customerId: customer.id,
  });

  return reply.status(200).send(previewResult);
}
