import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params } from "./customerOrderCount.schemas";

export async function getCustomerOrderCount(
  request: FastifyRequest<{
    Params: Params;
  }>,
  reply: FastifyReply,
) {
  const orderCount = await request.server.guest.products.getCustomerProductOrderCount(
    request.params.productId,
    request.customerAuth.customer.id,
  );

  return reply.status(200).send(orderCount);
}
