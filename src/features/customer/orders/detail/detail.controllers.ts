import { notFound } from "@core/utils";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { GetCustomerOrderParams } from "./detail.schemas";

export async function getCustomerOrder(
  request: FastifyRequest<{ Params: GetCustomerOrderParams }>,
  reply: FastifyReply,
) {
  const { customer } = request.customerAuth;
  const order = await request.server.customer.orders.get({
    customerId: customer.id,
    orderId: request.params.orderId,
  });

  if (!order) {
    throw notFound("order.notFound", "The order was not found");
  }

  return reply.status(200).send(order);
}
