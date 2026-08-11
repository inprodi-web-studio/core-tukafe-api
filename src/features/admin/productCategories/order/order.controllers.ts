import type { FastifyReply, FastifyRequest } from "fastify";
import type { OrderBody, Params } from "./order.schemas";

export async function reorder(
  request: FastifyRequest<{ Params: Params; Body: OrderBody }>,
  reply: FastifyReply,
) {
  await request.server.admin.productCategories.reorder(
    request.params.categoryId,
    request.body.direction,
  );

  return reply.status(204).send();
}
