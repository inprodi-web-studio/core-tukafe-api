import type { FastifyReply, FastifyRequest } from "fastify";
import type { ListQuery } from "./list.schemas";

export async function list(
  request: FastifyRequest<{
    Querystring: ListQuery;
  }>,
  reply: FastifyReply,
) {
  const products = await request.server.guest.products.list({
    organizationId: request.query.organizationId,
    categoryId: request.query.categoryId,
  });

  return reply.status(200).send(products);
}
