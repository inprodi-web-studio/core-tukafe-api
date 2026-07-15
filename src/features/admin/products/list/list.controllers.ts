import type { FastifyReply, FastifyRequest } from "fastify";
import type { ListQuery } from "./list.schemas";

export async function list(
  request: FastifyRequest<{ Querystring: ListQuery }>,
  reply: FastifyReply,
) {
  const products = await request.server.admin.products.list({
    ...request.query,
    organizationId: request.auth.member.organizationId,
  });

  return reply.status(200).send(products);
}
