import type { FastifyReply, FastifyRequest } from "fastify";
import type { ListQuery } from "./list.schemas";

export async function list(
  request: FastifyRequest<{ Querystring: ListQuery }>,
  reply: FastifyReply,
) {
  const categories = await request.server.admin.productCategories.list(request.query);

  return reply.status(200).send(categories);
}
