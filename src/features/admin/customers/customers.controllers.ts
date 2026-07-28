import type { FastifyReply, FastifyRequest } from "fastify";
import type { CustomerListQuery } from "./customers.schemas";

export async function listCustomers(
  request: FastifyRequest<{ Querystring: CustomerListQuery }>,
  reply: FastifyReply,
) {
  const customers = await request.server.admin.customers.list(request.query);

  return reply.status(200).send(customers);
}
