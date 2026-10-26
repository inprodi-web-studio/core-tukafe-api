import type { FastifyReply, FastifyRequest } from "fastify";
import type { ListQuery } from "@features/guest/productCategories/list/list.schemas";

export async function list(
  request: FastifyRequest<{ Querystring: ListQuery }>,
  reply: FastifyReply,
) {
  const categories = await request.server.guest.productCategories.list(
    request.query.organizationId,
  );

  return reply.status(200).send(categories);
}
