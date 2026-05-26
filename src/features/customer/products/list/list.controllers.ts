import type { FastifyReply, FastifyRequest } from "fastify";

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const products = await request.server.guest.products.list();

  return reply.status(200).send(products);
}
