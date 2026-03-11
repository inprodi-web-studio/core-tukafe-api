import type { ListQueryParams } from "@core/types";
import type { FastifyReply, FastifyRequest } from "fastify";

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as ListQueryParams;
  const products = await request.server.admin.products.list(query);

  return reply.status(200).send(products);
}
