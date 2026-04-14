import type { FastifyReply, FastifyRequest } from "fastify";

export async function list(request: FastifyRequest, reply: FastifyReply) {
  const organizations = await request.server.guest.organizations.list();

  return reply.status(200).send(organizations);
}
