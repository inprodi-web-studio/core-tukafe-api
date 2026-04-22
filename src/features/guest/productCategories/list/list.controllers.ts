import type { FastifyReply, FastifyRequest } from "fastify";

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const categories = await request.server.guest.productCategories.list();

  return reply.status(200).send(categories);
}
