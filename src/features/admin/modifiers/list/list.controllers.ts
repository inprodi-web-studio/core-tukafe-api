import type { FastifyReply, FastifyRequest } from "fastify";
import type { ListQueryParams } from "./list.schemas";

export async function list(
  request: FastifyRequest<{ Querystring: ListQueryParams }>,
  reply: FastifyReply,
) {
  const modifiers = await request.server.admin.modifiers.list(request.query);

  return reply.status(200).send(modifiers);
}
