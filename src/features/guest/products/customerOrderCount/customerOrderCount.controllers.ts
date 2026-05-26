import type { FastifyReply, FastifyRequest } from "fastify";
import type { Params, Querystring } from "./customerOrderCount.schemas";

export async function getCustomerOrderCount(
  request: FastifyRequest<{
    Params: Params;
    Querystring: Querystring;
  }>,
  reply: FastifyReply,
) {
  const orderCount = await request.server.guest.products.getCustomerProductOrderCount(
    request.params.productId,
    request.query.customerId,
  );

  return reply.status(200).send(orderCount);
}
